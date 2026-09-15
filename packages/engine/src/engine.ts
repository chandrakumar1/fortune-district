/**
 * Public engine API: createInitialState, applyCommand, legalCommands,
 * whoseDecision, computeNetWorth, projectForPlayer, hashState.
 *
 * Pure and deterministic (ADR-0001). Command validation lives here; rule
 * effects live in turn.ts / auction.ts / internal.ts.
 */

import { closeAuction, openAuction, recordBid } from './auction.ts';
import { BOARD } from './board.ts';
import {
  CITY_PULSE_FIXED_SCHEDULE,
  CREDIT_LINE_AMOUNT,
  EXCHANGE_PAY_DENOMINATOR,
  EXCHANGE_PAY_NUMERATOR,
  MAX_PLAYERS,
  MAX_UPGRADE_LEVEL,
  MIN_PLAYERS,
  STARTING_CASH,
  UPGRADES_PER_TURN,
  UPGRADE_COST,
} from './constants.ts';
import { emit, fromDraft, netWorthOf, payBank, playerOf, toDraft } from './internal.ts';
import type { Draft } from './internal.ts';
import { fraction } from './money.ts';
import { createRng, shuffle } from './rng.ts';
import { RULINGS } from './rulings.ts';
import { actionsStep, endTurn, moveAndResolve, rerollPulse, startTurn } from './turn.ts';
import type {
  Actor,
  ApplyResult,
  Command,
  Credits,
  GameState,
  MatchConfig,
  PlayerId,
  PlayerView,
  RuleViolationCode,
  TileIndex,
  TurnStep,
} from './types.ts';

// ---------------------------------------------------------------------------
// createInitialState
// ---------------------------------------------------------------------------

export function createInitialState(config: MatchConfig): GameState {
  return {
    matchId: config.matchId,
    config,
    rng: createRng(config.seed),
    round: 1,
    turnInRound: 0,
    phase: { kind: 'lobby' },
    board: BOARD,
    players: config.players.map((p, i) => ({
      id: p.id,
      seat: i,
      displayName: p.displayName,
      cash: STARTING_CASH,
      debt: 0,
      creditLine: 0,
      leverageTokens: RULINGS.LEVERAGE_STARTING_TOKENS,
      position: 0,
      connected: true,
    })),
    ownership: {},
    upgrades: {},
    pricePaid: {},
    upgradeSpend: {},
    auction: null,
    cityPulse: {
      schedule: CITY_PULSE_FIXED_SCHEDULE.map((e) => ({ round: e.round, boosted: e.boosted, suppressed: e.suppressed })),
      telegraphed: [],
      applied: [],
      active: null,
    },
    eventLog: [],
    nextSeq: 0,
  };
}

// ---------------------------------------------------------------------------
// applyCommand
// ---------------------------------------------------------------------------

function fail(code: RuleViolationCode, message: string, command: Command): ApplyResult {
  return { ok: false, error: { code, message, command } };
}

function ok(d: Draft): ApplyResult {
  return { ok: true, state: fromDraft(d), events: d.newEvents };
}

export function applyCommand(state: GameState, command: Command): ApplyResult {
  if (state.phase.kind === 'ended') return fail('MATCH_ENDED', 'The match has ended.', command);

  switch (command.type) {
    case 'START_MATCH':
      return startMatch(state, command);
    case 'ADVANCE':
    case 'BUY_PROPERTY':
    case 'DECLINE_PROPERTY':
    case 'UPGRADE_PROPERTY':
    case 'USE_LEVERAGE_TOKEN':
    case 'REROLL_PULSE':
    case 'END_TURN':
    case 'TURN_TIMED_OUT':
      return turnCommand(state, command);
    case 'SUBMIT_SEALED_BID':
    case 'CLOSE_AUCTION':
      return auctionCommand(state, command);
    default:
      return fail('UNKNOWN_COMMAND', `Unknown command ${(command as { type: string }).type}.`, command);
  }
}

function startMatch(state: GameState, command: Command): ApplyResult {
  if (command.by !== 'host') return fail('NOT_YOUR_TURN', 'Only the host may start the match.', command);
  if (state.phase.kind !== 'lobby') return fail('MATCH_ALREADY_STARTED', 'The match has already started.', command);
  const n = state.players.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) {
    return fail('INVALID_PLAYER_COUNT', `Fortune District needs ${MIN_PLAYERS}–${MAX_PLAYERS} players, got ${n}.`, command);
  }
  const d = toDraft(state);
  const r = shuffle(d.rng, d.players);
  d.rng = r.rng;
  d.players = r.value.map((p, seat) => ({ ...p, seat }));
  d.round = 1;
  d.turnInRound = 0;
  emit(d, { type: 'MATCH_STARTED', seatOrder: d.players.map((p) => p.id) });
  startTurn(d);
  return ok(d);
}

function turnCommand(state: GameState, command: Command): ApplyResult {
  const phase = state.phase;
  if (phase.kind !== 'turn') return fail('WRONG_PHASE', `Command ${command.type} is not valid during ${phase.kind}.`, command);
  const active = phase.activePlayer;

  if (command.type === 'TURN_TIMED_OUT') {
    if (command.by !== 'host') return fail('NOT_YOUR_TURN', 'Only the host may time out a turn.', command);
    return timeout(state, command);
  }
  if (command.by !== active) return fail('NOT_YOUR_TURN', `It is ${active}'s turn.`, command);

  const step = phase.step;
  switch (command.type) {
    case 'ADVANCE': {
      if (step.kind !== 'roll') return fail('WRONG_PHASE', 'Dice have already been used this turn.', command);
      const d = toDraft(state);
      moveAndResolve(d, active, step.dice);
      return ok(d);
    }

    case 'BUY_PROPERTY': {
      if (step.kind !== 'buy_or_decline' || step.tileIndex !== command.tileIndex) {
        return fail('PROPERTY_NOT_AVAILABLE', 'No purchase is pending for that tile.', command);
      }
      const tile = state.board[command.tileIndex];
      if (!tile || tile.kind !== 'property') return fail('PROPERTY_NOT_AVAILABLE', 'Not a property.', command);
      const player = state.players.find((p) => p.id === active);
      if (!player || player.cash < tile.price) return fail('INSUFFICIENT_FUNDS', `Need ₵${tile.price}.`, command);
      const d = toDraft(state);
      payBank(d, active, tile.price, 'purchase');
      d.ownership[tile.index] = active;
      d.pricePaid[tile.index] = tile.price;
      d.upgrades[tile.index] = 0;
      d.upgradeSpend[tile.index] = 0;
      emit(d, { type: 'PROPERTY_PURCHASED', player: active, tileIndex: tile.index, price: tile.price });
      d.phase = { kind: 'turn', activePlayer: active, step: actionsStep() };
      return ok(d);
    }

    case 'DECLINE_PROPERTY': {
      if (step.kind !== 'buy_or_decline' || step.tileIndex !== command.tileIndex) {
        return fail('PROPERTY_NOT_AVAILABLE', 'No purchase is pending for that tile.', command);
      }
      const d = toDraft(state);
      decline(d, active, command.tileIndex);
      return ok(d);
    }

    case 'UPGRADE_PROPERTY': {
      if (step.kind !== 'actions') return fail('WRONG_PHASE', 'Upgrades are only allowed after moving.', command);
      const reason = upgradeBlocker(state, active, command.tileIndex, step);
      if (reason) return fail(reason.code, reason.message, command);
      const d = toDraft(state);
      const cost = upgradeCost(state, command.tileIndex, step.exchangeDiscount);
      payBank(d, active, cost, 'upgrade');
      const level = (d.upgrades[command.tileIndex] ?? 0) + 1;
      d.upgrades[command.tileIndex] = level;
      d.upgradeSpend[command.tileIndex] = (d.upgradeSpend[command.tileIndex] ?? 0) + cost;
      emit(d, { type: 'PROPERTY_UPGRADED', player: active, tileIndex: command.tileIndex, level, cost, exchangeDiscount: step.exchangeDiscount });
      d.phase = { kind: 'turn', activePlayer: active, step: { ...step, upgradesThisTurn: step.upgradesThisTurn + 1, exchangeDiscount: false } };
      return ok(d);
    }

    case 'USE_LEVERAGE_TOKEN': {
      if (step.kind !== 'actions') return fail('WRONG_PHASE', 'Leverage is only usable after moving.', command);
      const player = state.players.find((p) => p.id === active);
      if (!player || player.leverageTokens <= 0) return fail('NO_LEVERAGE_TOKENS', 'No Leverage tokens.', command);
      const payload = command.payload;
      if (payload.kind === 'force_auction') {
        const tile = state.board[payload.tileIndex];
        // R6: unowned properties only.
        if (!tile || tile.kind !== 'property' || state.ownership[tile.index] !== undefined) {
          return fail('INVALID_LEVERAGE_TARGET', 'Force Auction targets an unowned property.', command);
        }
        const d = toDraft(state);
        playerOf(d, active).leverageTokens -= 1;
        emit(d, { type: 'LEVERAGE_TOKEN_USED', player: active, payload });
        openAuction(d, tile.index, active, 'leverage', step);
        return ok(d);
      }
      if (payload.kind === 'credit_line') {
        const d = toDraft(state);
        const p = playerOf(d, active);
        p.leverageTokens -= 1;
        emit(d, { type: 'LEVERAGE_TOKEN_USED', player: active, payload });
        // R9: separate interest-free balance, settled at final scoring via Net
        // Worth. Not incoming income — the 50% ordinary-debt rule does not apply.
        p.creditLine += CREDIT_LINE_AMOUNT;
        p.cash += CREDIT_LINE_AMOUNT;
        emit(d, { type: 'CREDIT_LINE_TAKEN', player: active, amount: CREDIT_LINE_AMOUNT });
        return ok(d);
      }
      return fail('UNKNOWN_COMMAND', 'Unknown Leverage payload.', command);
    }

    case 'REROLL_PULSE': {
      if (step.kind !== 'actions' || !step.pulseRelayAvailable) {
        return fail('REROLL_NOT_AVAILABLE', 'Pulse reroll is only available after landing on Pulse Relay.', command);
      }
      const d = toDraft(state);
      rerollPulse(d, active);
      d.phase = { kind: 'turn', activePlayer: active, step: { ...step, pulseRelayAvailable: false } };
      return ok(d);
    }

    case 'END_TURN': {
      if (step.kind !== 'actions') return fail('WRONG_PHASE', 'Resolve the pending decision before ending the turn.', command);
      const d = toDraft(state);
      endTurn(d, active);
      return ok(d);
    }

    default:
      return fail('UNKNOWN_COMMAND', `Unexpected ${command.type}.`, command);
  }
}

function decline(d: Draft, active: PlayerId, tileIndex: TileIndex): void {
  emit(d, { type: 'PROPERTY_DECLINED', player: active, tileIndex });
  openAuction(d, tileIndex, active, 'decline', actionsStep());
}

/** R11: step-local timeout defaults. */
function timeout(state: GameState, command: Command): ApplyResult {
  if (state.phase.kind !== 'turn') return fail('WRONG_PHASE', 'No turn in progress.', command);
  const active = state.phase.activePlayer;
  const step = state.phase.step;
  const d = toDraft(state);
  emit(d, { type: 'TURN_TIMED_OUT', player: active, step: step.kind });
  switch (step.kind) {
    case 'roll':
      moveAndResolve(d, active, step.dice); // movement still occurs on timeout: exactly the dice sum
      break;
    case 'buy_or_decline':
      decline(d, active, step.tileIndex);
      break;
    case 'actions':
      endTurn(d, active);
      break;
  }
  return ok(d);
}

function auctionCommand(state: GameState, command: Extract<Command, { type: 'SUBMIT_SEALED_BID' | 'CLOSE_AUCTION' }>): ApplyResult {
  if (state.phase.kind !== 'auction' || !state.auction) {
    return fail('WRONG_PHASE', `Command ${command.type} is only valid during an auction.`, command);
  }
  const a = state.auction;
  if (command.type === 'CLOSE_AUCTION') {
    if (command.by !== 'host') return fail('NOT_YOUR_TURN', 'Only the host may close an auction.', command);
    const d = toDraft(state);
    closeAuction(d);
    return ok(d);
  }
  // SUBMIT_SEALED_BID
  const bidder = command.by;
  if (bidder === 'host' || !a.eligible.includes(bidder)) return fail('NOT_ELIGIBLE_TO_BID', 'Not eligible to bid.', command);
  if (a.bids[bidder] !== undefined) return fail('INVALID_BID', 'Bid already submitted.', command);
  const player = state.players.find((p) => p.id === bidder);
  if (!player) return fail('NOT_ELIGIBLE_TO_BID', 'Unknown bidder.', command);
  const amount = command.amount;
  if (!Number.isInteger(amount) || amount < a.minimumBid) return fail('INVALID_BID', `Minimum bid is ₵${a.minimumBid}.`, command);
  if (amount > player.cash) return fail('INVALID_BID', `Bid exceeds cash (₵${player.cash}).`, command);
  const d = toDraft(state);
  recordBid(d, bidder, amount);
  return ok(d);
}

// ---------------------------------------------------------------------------
// Upgrade helpers
// ---------------------------------------------------------------------------

export function upgradeCost(state: Pick<GameState, 'board'>, tileIndex: TileIndex, exchangeDiscount: boolean): Credits {
  const tile = state.board[tileIndex];
  if (!tile || tile.kind !== 'property') throw new Error('not a property');
  const full = UPGRADE_COST[tile.tier];
  return exchangeDiscount ? fraction(full, EXCHANGE_PAY_NUMERATOR, EXCHANGE_PAY_DENOMINATOR) : full;
}

function upgradeBlocker(
  state: GameState,
  player: PlayerId,
  tileIndex: TileIndex,
  step: Extract<TurnStep, { kind: 'actions' }>,
): { code: RuleViolationCode; message: string } | null {
  const tile = state.board[tileIndex];
  if (!tile || tile.kind !== 'property' || state.ownership[tileIndex] !== player) {
    return { code: 'UPGRADE_NOT_ALLOWED', message: 'You can only upgrade a property you own.' };
  }
  if (step.upgradesThisTurn >= UPGRADES_PER_TURN) return { code: 'UPGRADE_NOT_ALLOWED', message: 'One upgrade per turn.' };
  if ((state.upgrades[tileIndex] ?? 0) >= MAX_UPGRADE_LEVEL) return { code: 'UPGRADE_NOT_ALLOWED', message: 'Max 2 upgrades per property.' };
  const cost = upgradeCost(state, tileIndex, step.exchangeDiscount);
  const p = state.players.find((x) => x.id === player);
  if (!p || p.cash < cost) return { code: 'INSUFFICIENT_FUNDS', message: `Need ₵${cost}.` };
  return null;
}

// ---------------------------------------------------------------------------
// legalCommands / whoseDecision
// ---------------------------------------------------------------------------

export function legalCommands(state: GameState, actor: Actor): readonly Command[] {
  const phase = state.phase;
  switch (phase.kind) {
    case 'lobby':
      return actor === 'host' ? [{ type: 'START_MATCH', by: 'host' }] : [];
    case 'ended':
      return [];
    case 'auction': {
      const a = state.auction;
      if (!a) return [];
      if (actor === 'host') return [{ type: 'CLOSE_AUCTION', by: 'host' }];
      const p = state.players.find((x) => x.id === actor);
      if (!p || !a.eligible.includes(actor) || a.bids[actor] !== undefined || p.cash < a.minimumBid) return [];
      // Representative bid at the minimum; any integer in [minimumBid, cash] is legal.
      return [{ type: 'SUBMIT_SEALED_BID', by: actor, amount: a.minimumBid }];
    }
    case 'turn': {
      if (actor === 'host') return [{ type: 'TURN_TIMED_OUT', by: 'host' }];
      if (actor !== phase.activePlayer) return [];
      const step = phase.step;
      const by = actor;
      switch (step.kind) {
        case 'roll':
          return [{ type: 'ADVANCE', by }];
        case 'buy_or_decline': {
          const tile = state.board[step.tileIndex];
          const p = state.players.find((x) => x.id === by);
          const out: Command[] = [];
          if (tile && tile.kind === 'property' && p && p.cash >= tile.price) out.push({ type: 'BUY_PROPERTY', by, tileIndex: step.tileIndex });
          out.push({ type: 'DECLINE_PROPERTY', by, tileIndex: step.tileIndex });
          return out;
        }
        case 'actions': {
          const out: Command[] = [];
          const p = state.players.find((x) => x.id === by);
          if (!p) return out;
          for (const tile of state.board) {
            if (tile.kind === 'property' && upgradeBlocker(state, by, tile.index, step) === null) {
              out.push({ type: 'UPGRADE_PROPERTY', by, tileIndex: tile.index });
            }
          }
          if (p.leverageTokens > 0) {
            for (const tile of state.board) {
              if (tile.kind === 'property' && state.ownership[tile.index] === undefined) {
                out.push({ type: 'USE_LEVERAGE_TOKEN', by, payload: { kind: 'force_auction', tileIndex: tile.index } });
              }
            }
            out.push({ type: 'USE_LEVERAGE_TOKEN', by, payload: { kind: 'credit_line' } });
          }
          if (step.pulseRelayAvailable) out.push({ type: 'REROLL_PULSE', by });
          out.push({ type: 'END_TURN', by });
          return out;
        }
      }
    }
  }
}

export function whoseDecision(state: GameState): Actor | null {
  const phase = state.phase;
  switch (phase.kind) {
    case 'lobby':
      return 'host';
    case 'ended':
      return null;
    case 'turn':
      return phase.activePlayer;
    case 'auction': {
      const a = state.auction;
      if (!a) return 'host';
      const pending = a.eligible.find((id) => {
        const p = state.players.find((x) => x.id === id);
        return p !== undefined && a.bids[id] === undefined && p.cash >= a.minimumBid;
      });
      return pending ?? 'host';
    }
  }
}

// ---------------------------------------------------------------------------
// Scoring / projection / hashing
// ---------------------------------------------------------------------------

export function computeNetWorth(state: GameState, player: PlayerId): Credits {
  return netWorthOf(state, player);
}

export function projectForPlayer(state: GameState, viewer: PlayerId): PlayerView {
  const { rng: _rng, auction, ...rest } = state;
  void _rng;
  return {
    viewer,
    state: {
      ...rest,
      auction: auction
        ? { tileIndex: auction.tileIndex, openedBy: auction.openedBy, origin: auction.origin, eligible: auction.eligible, minimumBid: auction.minimumBid, myBid: auction.bids[viewer] ?? null }
        : null,
    },
  };
}

/** FNV-1a (two 32-bit lanes) over the JSON of the state minus the event log. */
export function hashState(state: GameState): string {
  const { eventLog: _log, ...rest } = state;
  void _log;
  const text = JSON.stringify(rest);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x01000193) ^ (h2 >>> 13);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

/** Convenience for hosts: whose turn it is (during an auction, the player it will return to). */
export function activePlayer(state: GameState): PlayerId | null {
  return state.phase.kind === 'turn' ? state.phase.activePlayer : state.phase.kind === 'auction' ? state.phase.returnTo : null;
}
