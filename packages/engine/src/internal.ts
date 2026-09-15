/**
 * Internal helpers shared by the rule modules. Not exported from the package.
 *
 * Pattern: applyCommand deep-copies the incoming state into a mutable Draft,
 * rule functions mutate the draft and push events, and the draft is returned
 * as the new (frozen-by-type) state. Inputs are never mutated.
 */

import {
  DEBT_INTEREST_DENOMINATOR,
  DEBT_INTEREST_NUMERATOR,
  INCOME_TO_DEBT_DENOMINATOR,
  INCOME_TO_DEBT_NUMERATOR,
  PAYMENT_CAP_DENOMINATOR,
  PAYMENT_CAP_NUMERATOR,
  PULSE_BOOST,
  PULSE_SUPPRESS,
  SET_BONUS_MULTIPLIER,
  UPGRADE_YIELD,
} from './constants.ts';
import { categoryTiles } from './board.ts';
import { fraction } from './money.ts';
import type {
  AuctionState,
  Category,
  CityPulseEffect,
  CityPulseState,
  Credits,
  GameEvent,
  GameState,
  Phase,
  PlayerId,
  PlayerState,
  PropertyTile,
  RngState,
  TileIndex,
} from './types.ts';

// ---------------------------------------------------------------------------
// Draft (mutable working copy)
// ---------------------------------------------------------------------------

export interface MutablePlayer {
  id: PlayerId;
  seat: number;
  displayName: string;
  cash: Credits;
  debt: Credits;
  creditLine: Credits;
  leverageTokens: number;
  position: TileIndex;
  connected: boolean;
}

/** Mutable working copy of CityPulseState (the public type stays readonly). */
export interface MutableCityPulse {
  schedule: CityPulseEffect[];
  telegraphed: CityPulseEffect[];
  applied: CityPulseEffect[];
  active: CityPulseEffect | null;
}

export interface Draft {
  matchId: string;
  config: GameState['config'];
  rng: RngState;
  round: number;
  turnInRound: number;
  phase: Phase;
  board: GameState['board'];
  players: MutablePlayer[];
  ownership: Record<TileIndex, PlayerId>;
  upgrades: Record<TileIndex, number>;
  pricePaid: Record<TileIndex, Credits>;
  upgradeSpend: Record<TileIndex, Credits>;
  auction: AuctionState | null;
  cityPulse: MutableCityPulse;
  eventLog: GameEvent[];
  nextSeq: number;
  /** Events produced by the current applyCommand call. */
  newEvents: GameEvent[];
}

export function toDraft(state: GameState): Draft {
  return {
    matchId: state.matchId,
    config: state.config,
    rng: state.rng,
    round: state.round,
    turnInRound: state.turnInRound,
    phase: state.phase,
    board: state.board,
    players: state.players.map((p) => ({ ...p })),
    ownership: { ...state.ownership },
    upgrades: { ...state.upgrades },
    pricePaid: { ...state.pricePaid },
    upgradeSpend: { ...state.upgradeSpend },
    auction: state.auction ? { ...state.auction, bids: { ...state.auction.bids }, eligible: state.auction.eligible.slice() } : null,
    cityPulse: {
      schedule: state.cityPulse.schedule.slice(),
      telegraphed: state.cityPulse.telegraphed.slice(),
      applied: state.cityPulse.applied.slice(),
      active: state.cityPulse.active,
    },
    eventLog: state.eventLog.slice(),
    nextSeq: state.nextSeq,
    newEvents: [],
  };
}

export function fromDraft(d: Draft): GameState {
  // Key order is fixed by construction so JSON.stringify is stable (spec §6.3).
  return {
    matchId: d.matchId,
    config: d.config,
    rng: d.rng,
    round: d.round,
    turnInRound: d.turnInRound,
    phase: d.phase,
    board: d.board,
    players: d.players,
    ownership: d.ownership,
    upgrades: d.upgrades,
    pricePaid: d.pricePaid,
    upgradeSpend: d.upgradeSpend,
    auction: d.auction,
    cityPulse: d.cityPulse,
    eventLog: d.eventLog,
    nextSeq: d.nextSeq,
  };
}

type EventBody = GameEvent extends infer E ? (E extends GameEvent ? Omit<E, 'seq' | 'round'> : never) : never;

export function emit(d: Draft, body: EventBody): void {
  const event = { seq: d.nextSeq, round: d.round, ...body } as GameEvent;
  d.nextSeq += 1;
  d.eventLog.push(event);
  d.newEvents.push(event);
}

export function playerOf(d: Draft, id: PlayerId): MutablePlayer {
  const p = d.players.find((x) => x.id === id);
  if (!p) throw new Error(`unknown player ${id}`);
  return p;
}

export function propertyAt(d: Pick<Draft, 'board'>, index: TileIndex): PropertyTile {
  const t = d.board[index];
  if (!t || t.kind !== 'property') throw new Error(`tile ${index} is not a property`);
  return t;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** Kit Part 4: Net worth = cash + prices paid + upgrades paid − debt (ordinary debt + Credit Line, R9). */
export function netWorthOf(
  s: Pick<GameState, 'ownership' | 'pricePaid' | 'upgradeSpend'> & { readonly players: readonly Pick<PlayerState, 'id' | 'cash' | 'debt' | 'creditLine'>[] },
  id: PlayerId,
): Credits {
  const p = s.players.find((x) => x.id === id);
  if (!p) throw new Error(`unknown player ${id}`);
  let total = p.cash - p.debt - p.creditLine;
  for (const [key, owner] of Object.entries(s.ownership)) {
    if (owner !== id) continue;
    const idx = Number(key);
    total += s.pricePaid[idx] ?? 0;
    total += s.upgradeSpend[idx] ?? 0;
  }
  return total;
}

/** R2: a player is last if no other player has a lower Net Worth. */
export function isLastPlace(d: Draft, id: PlayerId): boolean {
  const mine = netWorthOf(d, id);
  return d.players.every((p) => netWorthOf(d, p.id) >= mine);
}

// ---------------------------------------------------------------------------
// Yield
// ---------------------------------------------------------------------------

export function ownsFullSet(s: Pick<GameState, 'board' | 'ownership'>, owner: PlayerId, category: Category): boolean {
  return categoryTiles(s.board, category).every((i) => s.ownership[i] === owner);
}

export function pulseFactor(pulse: CityPulseState, category: Category): { readonly num: number; readonly den: number } {
  const a = pulse.active;
  if (a && a.boosted === category) return { num: PULSE_BOOST.numerator, den: PULSE_BOOST.denominator };
  if (a && a.suppressed === category) return { num: PULSE_SUPPRESS.numerator, den: PULSE_SUPPRESS.denominator };
  return { num: 1, den: 1 };
}

/**
 * Locked rule 6: (base yield + upgrade yield) × set bonus × City Pulse modifier,
 * rounded down once at the end.
 */
export function yieldFor(s: Pick<GameState, 'board' | 'ownership' | 'upgrades' | 'cityPulse'>, tileIndex: TileIndex): Credits {
  const tile = propertyAt(s, tileIndex);
  const owner = s.ownership[tileIndex];
  if (owner === undefined) return 0;
  const level = s.upgrades[tileIndex] ?? 0;
  const gross = tile.baseYield + level * UPGRADE_YIELD[tile.tier];
  const set = ownsFullSet(s, owner, tile.category) ? SET_BONUS_MULTIPLIER : 1;
  const pf = pulseFactor(s.cityPulse, tile.category);
  return Math.floor((gross * set * pf.num) / pf.den);
}

// ---------------------------------------------------------------------------
// Money flows
// ---------------------------------------------------------------------------

export type IncomeSource = 'hub' | 'yield' | 'windfall';

/**
 * Locked rule 2: when a player receives incoming money, 50% (rounded down) is
 * applied to ordinary debt up to the outstanding amount; the rest becomes cash.
 */
export function receiveIncome(d: Draft, id: PlayerId, amount: Credits, source: IncomeSource): void {
  const p = playerOf(d, id);
  let toDebt = 0;
  if (p.debt > 0 && amount > 0) {
    toDebt = Math.min(p.debt, fraction(amount, INCOME_TO_DEBT_NUMERATOR, INCOME_TO_DEBT_DENOMINATOR));
    p.debt -= toDebt;
  }
  p.cash += amount - toDebt;
  if (toDebt > 0) emit(d, { type: 'DEBT_REPAID', player: id, amount: toDebt, source });
}

/**
 * Player → player payment under the 25% cap: paid = min(requested, floor(cash/4));
 * the remainder becomes ordinary debt. The recipient receives `paid` as income.
 */
export function payPlayer(d: Draft, from: PlayerId, to: PlayerId, requested: Credits): void {
  const payer = playerOf(d, from);
  const cap = fraction(payer.cash, PAYMENT_CAP_NUMERATOR, PAYMENT_CAP_DENOMINATOR);
  const paid = Math.min(requested, cap);
  const shortfall = requested - paid;
  payer.cash -= paid;
  emit(d, { type: 'PAYMENT_MADE', from, to, requested, paid, capped: shortfall > 0, reason: 'yield' });
  if (shortfall > 0) {
    payer.debt += shortfall;
    emit(d, { type: 'DEBT_INCURRED', player: from, amount: shortfall, reason: 'capped_payment' });
  }
  if (paid > 0) receiveIncome(d, to, paid, 'yield');
}

/** Player → bank. Caller guarantees amount ≤ cash. */
export function payBank(d: Draft, from: PlayerId, amount: Credits, reason: 'audit' | 'purchase' | 'auction' | 'upgrade'): void {
  const payer = playerOf(d, from);
  if (amount > payer.cash) throw new Error(`payBank: ${from} cannot pay ${amount} with cash ${payer.cash}`);
  payer.cash -= amount;
  emit(d, { type: 'PAYMENT_MADE', from, to: null, requested: amount, paid: amount, capped: false, reason });
}

/** R4: 10% interest on ordinary debt, rounded down. */
export function accrueInterest(d: Draft): void {
  for (const p of d.players) {
    if (p.debt <= 0) continue;
    const interest = fraction(p.debt, DEBT_INTEREST_NUMERATOR, DEBT_INTEREST_DENOMINATOR);
    if (interest <= 0) continue;
    p.debt += interest;
    emit(d, { type: 'INTEREST_ACCRUED', player: p.id, amount: interest });
  }
}
