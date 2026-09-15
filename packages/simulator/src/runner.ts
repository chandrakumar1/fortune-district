/**
 * Headless match runner (ARCHITECTURE §4). A host for the engine: it asks bots
 * for decisions, converts "no decision" into TURN_TIMED_OUT / no bid, and
 * closes auctions. No wall-clock time is involved (S1).
 */

import {
  AUCTION_BID_WINDOW_SECONDS,
  TURN_TIMER_SECONDS,
  applyCommand,
  computeNetWorth,
  createInitialState,
  hashState,
  legalCommands,
  projectForPlayer,
  whoseDecision,
} from './engine.ts';
import type { Command, GameEvent, GameState, PlayerId } from './engine.ts';
import type { Bot } from './bots.ts';

export interface MatchRecord {
  readonly seed: number;
  readonly seatOrder: readonly PlayerId[];
  readonly finalState: GameState;
  readonly commands: readonly Command[];
  readonly commandCount: number;
  /** Simulated seconds: bot latency per decision, capped at the turn timer per turn; timeouts count the full timer. */
  readonly turnSeconds: number;
  /** Net Worth per player before round 1 (index 0) and at the end of every round (1..12), as the engine computes it. */
  readonly netWorthByRound: Readonly<Record<number, Readonly<Record<PlayerId, number>>>>;
  readonly finalHash: string;
}

export interface RunOptions {
  readonly seed: number;
  readonly bots: Readonly<Record<PlayerId, Bot>>;
  readonly players: readonly { readonly id: PlayerId; readonly displayName: string }[];
  /** Safety valve; a 4-player match uses well under 1,000 commands. */
  readonly maxCommands?: number;
}

export function runMatch(opts: RunOptions): MatchRecord {
  let state = createInitialState({ matchId: `sim-${opts.seed}`, seed: opts.seed, players: opts.players });
  const commands: Command[] = [];
  let turnSeconds = 0;
  let thisTurnSeconds = 0;
  const netWorthByRound: Record<number, Record<PlayerId, number>> = {
    0: Object.fromEntries(state.players.map((p) => [p.id, computeNetWorth(state, p.id)])),
  };
  const max = opts.maxCommands ?? 5000;

  const step = (cmd: Command): readonly GameEvent[] => {
    const r = applyCommand(state, cmd);
    if (!r.ok) throw new Error(`bot issued an illegal command ${cmd.type} (${r.error.code}: ${r.error.message})`);
    state = r.state;
    commands.push(cmd);
    for (const e of r.events) {
      if (e.type === 'TURN_ENDED') {
        turnSeconds += Math.min(thisTurnSeconds, TURN_TIMER_SECONDS);
        thisTurnSeconds = 0;
      }
      if (e.type === 'ROUND_ENDED') {
        // The command that closes round r also starts round r+1 (interest, Leverage grant, Pulse).
        // The engine's Net Worth after the command therefore already includes round r+1's interest;
        // add it back so the snapshot is exactly "end of round r". Grants and Pulses do not change NW.
        const snapshot: Record<PlayerId, number> = Object.fromEntries(state.players.map((p) => [p.id, computeNetWorth(state, p.id)]));
        for (const x of r.events) {
          if (x.type === 'INTEREST_ACCRUED' && x.round === e.round + 1) snapshot[x.player] = (snapshot[x.player] ?? 0) + x.amount;
        }
        netWorthByRound[e.round] = snapshot;
      }
    }
    return r.events;
  };

  while (state.phase.kind !== 'ended') {
    if (commands.length >= max) throw new Error(`match exceeded ${max} commands`);

    if (state.phase.kind === 'auction') {
      runAuction();
      continue;
    }

    const who = whoseDecision(state);
    if (who === null) break;
    const legal = legalCommands(state, who);
    if (who === 'host') {
      const cmd = legal[0];
      if (!cmd) throw new Error('host has no legal command');
      step(cmd);
      continue;
    }
    const bot = opts.bots[who];
    if (!bot) throw new Error(`no bot for ${who}`);
    const cmd = bot.decide(projectForPlayer(state, who), legal);
    if (cmd === null) {
      thisTurnSeconds = TURN_TIMER_SECONDS;
      step({ type: 'TURN_TIMED_OUT', by: 'host' });
    } else {
      thisTurnSeconds += bot.latencySeconds;
      step(cmd);
    }
  }

  return {
    seed: opts.seed,
    seatOrder: state.players.map((p) => p.id),
    finalState: state,
    commands,
    commandCount: commands.length,
    turnSeconds,
    netWorthByRound,
    finalHash: hashState(state),
  };

  function runAuction(): void {
    const a = state.auction;
    if (!a) throw new Error('auction phase without auction state');
    const tile = state.board[a.tileIndex];
    const listPrice = tile && tile.kind === 'property' ? tile.price : 0;
    for (const id of a.eligible) {
      const bot = opts.bots[id];
      const p = state.players.find((x) => x.id === id);
      if (!bot || !p || p.cash < a.minimumBid) continue;
      const amount = bot.bid(projectForPlayer(state, id), { tileIndex: a.tileIndex, minimumBid: a.minimumBid, listPrice, cash: p.cash });
      if (amount === null || !Number.isInteger(amount) || amount < a.minimumBid || amount > p.cash) continue;
      step({ type: 'SUBMIT_SEALED_BID', by: id, amount });
    }
    thisTurnSeconds += AUCTION_BID_WINDOW_SECONDS;
    step({ type: 'CLOSE_AUCTION', by: 'host' });
  }
}

/** Replay a recorded command list from its seed; returns the final hash (S3/S5). */
export function replay(seed: number, players: RunOptions['players'], commands: readonly Command[]): string {
  let state = createInitialState({ matchId: `sim-${seed}`, seed, players });
  for (const cmd of commands) {
    const r = applyCommand(state, cmd);
    if (!r.ok) throw new Error(`replay diverged at ${cmd.type}: ${r.error.code}`);
    state = r.state;
  }
  return hashState(state);
}
