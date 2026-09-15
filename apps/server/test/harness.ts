/**
 * Shared test harness: a MatchSession on a FakeClock with a recording sink,
 * plus helpers to seat players, start a match and drive it with a
 * deterministic policy that only ever sends commands the engine lists as
 * legal (as a well-behaved client would).
 */

import { applyCommand as realApply, legalCommands } from '../src/engine.ts';
import type { Command, GameState, PlayerId } from '../src/engine.ts';
import { FakeClock } from '../src/clock.ts';
import { MatchSession } from '../src/match-session.ts';
import type { MatchSessionOptions } from '../src/match-session.ts';
import type { Envelope, ServerMessage } from '../src/messages.ts';

export interface Sent {
  readonly to: PlayerId;
  readonly message: ServerMessage;
}

export interface Harness {
  readonly clock: FakeClock;
  session: MatchSession;
  readonly sent: Sent[];
  readonly clients: Record<PlayerId, string>;
  readonly tokens: Record<PlayerId, string>;
  /** Last VIEW envelope delivered to a player. */
  lastView(p: PlayerId): Envelope | null;
  rejections(p?: PlayerId): Sent[];
  /** Authoritative state, obtained the only way a test may: through the counting applyCommand wrapper. */
  state(): GameState | null;
  applied: number;
}

export function harness(names: readonly string[], opts: Partial<MatchSessionOptions> = {}): Harness {
  const clock = new FakeClock(1_000_000);
  const sent: Sent[] = [];
  let latest: GameState | null = null;
  const h: Harness = {
    clock,
    sent,
    clients: {},
    tokens: {},
    applied: 0,
    session: null as unknown as MatchSession,
    lastView(p) {
      for (let i = sent.length - 1; i >= 0; i--) {
        const s = sent[i]!;
        if (s.to === p && s.message.type === 'VIEW') return s.message.envelope;
      }
      return null;
    },
    rejections(p) {
      return sent.filter((s) => s.message.type === 'REJECTED' && (p === undefined || s.to === p));
    },
    state: () => latest,
  };
  const base = opts.applyCommand;
  h.session = new MatchSession({
    matchId: 'm-test',
    clock,
    sink: (to, message) => sent.push({ to, message }),
    seed: 4242,
    ...opts,
    applyCommand: (state, command) => {
      const r = (base ?? realApply)(state, command);
      if (r.ok) {
        h.applied++;
        latest = r.state;
      }
      return r;
    },
  });
  names.forEach((name, i) => {
    const clientId = `c${i + 1}`;
    const r = h.session.join(clientId, name);
    if (!r.ok) throw new Error(`join failed: ${r.reason}`);
    h.clients[r.playerId] = clientId;
    h.tokens[r.playerId] = r.token;
  });
  return h;
}

export function readyAll(h: Harness): void {
  for (const c of Object.values(h.clients)) h.session.handle(c, { type: 'READY', ready: true });
}

export function start(h: Harness): void {
  readyAll(h);
  h.session.handle(h.clients[h.session.creator!]!, { type: 'START' });
  if (h.session.roomPhase !== 'playing') throw new Error(`start failed: ${JSON.stringify(h.rejections().at(-1))}`);
}

/** The player the engine is waiting for (from the authoritative state the wrapper exposed). */
export function actorOf(h: Harness): PlayerId | 'host' | null {
  const s = h.state();
  if (!s) return null;
  if (s.phase.kind === 'turn') return s.phase.activePlayer;
  if (s.phase.kind === 'auction' && s.auction) return s.auction.eligible.find((id) => s.auction!.bids[id] === undefined && legalCommands(s, id).some((c) => c.type === 'SUBMIT_SEALED_BID')) ?? 'host';
  return null;
}

/** Legal commands for a player, stripped of `by` so they can be sent as a client would. */
export function legalFor(h: Harness, p: PlayerId): Command[] {
  const s = h.state();
  return s ? [...legalCommands(s, p)] : [];
}

export function sendCommand(h: Harness, p: PlayerId, command: Command): void {
  const { by: _by, ...rest } = command as Command & { by: unknown };
  void _by;
  h.session.handle(h.clients[p]!, { type: 'COMMAND', command: rest });
}

/**
 * Deterministic policy: buy when offered (every third offer declines), bid
 * the minimum in every other auction (others declare NO_BID), upgrade when
 * possible, use Leverage when offered, then end the turn. Returns the number
 * of client commands sent.
 */
export function playToEnd(h: Harness, maxSteps = 5000): number {
  let steps = 0;
  let offers = 0;
  let auctions = 0;
  while (h.session.roomPhase === 'playing' && steps++ < maxSteps) {
    const s = h.state()!;
    if (s.phase.kind === 'auction' && s.auction) {
      auctions++;
      for (const id of s.auction.eligible) {
        const bid = legalFor(h, id).find((c) => c.type === 'SUBMIT_SEALED_BID');
        if (!bid || h.session.playerOf(h.clients[id]!) !== id) continue;
        if (auctions % 2 === 0 && id !== s.auction.openedBy) h.session.handle(h.clients[id]!, { type: 'NO_BID' });
        else sendCommand(h, id, bid);
        if (h.state()!.phase.kind !== 'auction') break;
      }
      // If anyone is still pending after the round of bids, let the window expire.
      if (h.state()!.phase.kind === 'auction') h.clock.advance(10_000);
      continue;
    }
    const p = s.phase.kind === 'turn' ? s.phase.activePlayer : null;
    if (!p) break;
    if (h.session.playerOf(h.clients[p]!) !== p) {
      // Disconnected seat: nobody can act for it, so the official timer does (decision 3).
      h.clock.advance(20_000);
      continue;
    }
    const legal = legalFor(h, p);
    const pick =
      legal.find((c) => c.type === 'ADVANCE') ??
      (++offers % 3 === 0 ? legal.find((c) => c.type === 'DECLINE_PROPERTY') : legal.find((c) => c.type === 'BUY_PROPERTY')) ??
      legal.find((c) => c.type === 'DECLINE_PROPERTY') ??
      legal.find((c) => c.type === 'UPGRADE_PROPERTY') ??
      legal.find((c) => c.type === 'USE_LEVERAGE_TOKEN') ??
      legal.find((c) => c.type === 'REROLL_PULSE') ??
      legal.find((c) => c.type === 'END_TURN');
    if (!pick) throw new Error('no legal command for the active player');
    sendCommand(h, p, pick);
  }
  return steps;
}
