/**
 * Turn and round flow: dice, movement, landing resolution, round end, City Pulse.
 */

import {
  AUDIT_DENOMINATOR,
  AUDIT_NUMERATOR,
  BOARD_TILE_COUNT,
  CITY_PULSE_TELEGRAPH_LEAD_ROUNDS,
  DIE_SIDES,
  DISTRICT_HUB_BONUS,
  LEVERAGE_TOKEN_CAP,
  PROPERTY_CATEGORIES,
  ROUND_COUNT,
  WINDFALL_AMOUNT,
  WINDFALL_AMOUNT_IF_LAST,
} from './constants.ts';
import { accrueInterest, emit, isLastPlace, netWorthOf, payBank, payPlayer, playerOf, receiveIncome, yieldFor } from './internal.ts';
import type { Draft } from './internal.ts';
import { fraction } from './money.ts';
import { nextInt, rollTwoDice } from './rng.ts';
import type { Category, CityPulseEffect, PlayerId, TurnStep } from './types.ts';

// ---------------------------------------------------------------------------
// Turn start / movement
// ---------------------------------------------------------------------------

export function activePlayerId(d: Draft): PlayerId {
  const p = d.players[d.turnInRound];
  if (!p) throw new Error(`no player at seat ${d.turnInRound}`);
  return p.id;
}

export function startTurn(d: Draft): void {
  const id = activePlayerId(d);
  emit(d, { type: 'TURN_STARTED', player: id });
  // Two independent dice from the seeded RNG. The player must move exactly their sum.
  const roll = rollTwoDice(d.rng, DIE_SIDES);
  d.rng = roll.rng;
  const dice = roll.dice;
  emit(d, { type: 'DICE_ROLLED', player: id, dice });
  d.phase = { kind: 'turn', activePlayer: id, step: { kind: 'roll', dice } };
}

export function actionsStep(overrides: Partial<Extract<TurnStep, { kind: 'actions' }>> = {}): TurnStep {
  return { kind: 'actions', upgradesThisTurn: 0, exchangeDiscount: false, pulseRelayAvailable: false, ...overrides };
}

/** Move the active player by exactly the sum of the two dice and resolve the destination. */
export function moveAndResolve(d: Draft, id: PlayerId, dice: readonly [number, number]): void {
  const p = playerOf(d, id);
  const steps = dice[0] + dice[1];
  const from = p.position;
  const to = (from + steps) % BOARD_TILE_COUNT;
  p.position = to;
  emit(d, { type: 'PLAYER_MOVED', player: id, from, to, steps, dice });

  // District Hub: "+₵150 pass/land". Passing or landing on tile 0 happens
  // exactly when the move wraps. Credited before the landing resolves
  // (effects in board order: the Hub is crossed first).
  if (from + steps >= BOARD_TILE_COUNT) {
    emit(d, { type: 'HUB_BONUS_PAID', player: id, amount: DISTRICT_HUB_BONUS });
    receiveIncome(d, id, DISTRICT_HUB_BONUS, 'hub');
  }

  resolveLanding(d, id, to);
}

function resolveLanding(d: Draft, id: PlayerId, index: number): void {
  const tile = d.board[index];
  if (!tile) throw new Error(`no tile ${index}`);
  switch (tile.kind) {
    case 'district_hub':
      // Bonus already paid via the wrap check above.
      d.phase = { kind: 'turn', activePlayer: id, step: actionsStep() };
      return;

    case 'property': {
      const owner = d.ownership[index];
      if (owner === undefined) {
        emit(d, { type: 'PROPERTY_OFFERED', player: id, tileIndex: index });
        d.phase = { kind: 'turn', activePlayer: id, step: { kind: 'buy_or_decline', tileIndex: index } };
        return;
      }
      if (owner !== id) {
        payPlayer(d, id, owner, yieldFor(d, index));
      }
      d.phase = { kind: 'turn', activePlayer: id, step: actionsStep() };
      return;
    }

    case 'audit': {
      // R13: "pay 8% of cash" to the bank, rounded down.
      const p = playerOf(d, id);
      const amount = fraction(p.cash, AUDIT_NUMERATOR, AUDIT_DENOMINATOR);
      payBank(d, id, amount, 'audit');
      d.phase = { kind: 'turn', activePlayer: id, step: actionsStep() };
      return;
    }

    case 'windfall': {
      // "+₵100, or +₵250 if last" — R2: last = lowest Net Worth, evaluated before payout.
      const wasLast = isLastPlace(d, id);
      const amount = wasLast ? WINDFALL_AMOUNT_IF_LAST : WINDFALL_AMOUNT;
      emit(d, { type: 'WINDFALL_RECEIVED', player: id, amount, wasLast });
      receiveIncome(d, id, amount, 'windfall');
      d.phase = { kind: 'turn', activePlayer: id, step: actionsStep() };
      return;
    }

    case 'exchange':
      // R7: this turn's one upgrade may be bought at 20% off.
      emit(d, { type: 'EXCHANGE_DISCOUNT_GRANTED', player: id });
      d.phase = { kind: 'turn', activePlayer: id, step: actionsStep({ exchangeDiscount: true }) };
      return;

    case 'pulse_relay':
      // R10: optional reroll of the next upcoming Pulse during this action window.
      d.phase = {
        kind: 'turn',
        activePlayer: id,
        step: actionsStep({ pulseRelayAvailable: nextUpcomingPulseIndex(d) !== null }),
      };
      return;
  }
}

// ---------------------------------------------------------------------------
// Turn end / round end
// ---------------------------------------------------------------------------

export function endTurn(d: Draft, id: PlayerId): void {
  emit(d, { type: 'TURN_ENDED', player: id });
  if (d.turnInRound + 1 < d.players.length) {
    d.turnInRound += 1;
    startTurn(d);
    return;
  }
  endRound(d);
}

function endRound(d: Draft): void {
  emit(d, { type: 'ROUND_ENDED' });
  // No interest and no Leverage grant after round 12 (R4, R3).
  if (d.round >= ROUND_COUNT) {
    endMatch(d);
    return;
  }
  d.round += 1;
  d.turnInRound = 0;
  startRound(d);
  startTurn(d);
}

/**
 * R3: at the start of rounds 2–12, after interest, every player tied for the
 * lowest Net Worth receives one token, capped at LEVERAGE_TOKEN_CAP.
 */
function grantLeverageTokens(d: Draft): void {
  const worths = d.players.map((p) => ({ id: p.id, nw: netWorthOf(d, p.id) }));
  const min = Math.min(...worths.map((w) => w.nw));
  for (const w of worths) {
    if (w.nw !== min) continue;
    const p = playerOf(d, w.id);
    if (p.leverageTokens >= LEVERAGE_TOKEN_CAP) continue;
    p.leverageTokens += 1;
    emit(d, { type: 'LEVERAGE_TOKEN_GRANTED', player: w.id, netWorth: w.nw });
  }
}

function endMatch(d: Draft): void {
  // R12: descending Net Worth; equal values keep seat order (stable sort).
  const ranking = d.players
    .map((p) => ({ player: p.id, netWorth: netWorthOf(d, p.id) }))
    .sort((a, b) => b.netWorth - a.netWorth);
  d.phase = { kind: 'ended' };
  emit(d, { type: 'MATCH_ENDED', ranking });
}

/**
 * Start-of-round processing for rounds 2–12, in design order:
 * §5.2 interest (R4) → §5.3 Leverage grant (R3) → §6 City Pulse announce/apply.
 * Round 1 starts directly from START_MATCH and skips all three.
 */
function startRound(d: Draft): void {
  accrueInterest(d);
  grantLeverageTokens(d);

  const announceIdx = d.cityPulse.schedule.findIndex((e) => e.round === d.round + CITY_PULSE_TELEGRAPH_LEAD_ROUNDS);
  if (announceIdx >= 0) {
    const effect = d.cityPulse.schedule[announceIdx] as CityPulseEffect;
    d.cityPulse.telegraphed = [...d.cityPulse.telegraphed, effect];
    emit(d, { type: 'CITY_PULSE_TELEGRAPHED', effect });
  }
  const applyIdx = d.cityPulse.schedule.findIndex((e) => e.round === d.round);
  if (applyIdx >= 0) {
    const effect = d.cityPulse.schedule[applyIdx] as CityPulseEffect;
    d.cityPulse.telegraphed = d.cityPulse.telegraphed.filter((e) => e.round !== effect.round);
    d.cityPulse.applied = [...d.cityPulse.applied, effect];
    d.cityPulse.active = effect; // R5: persists until replaced.
    emit(d, { type: 'CITY_PULSE_APPLIED', effect });
  }
}

// ---------------------------------------------------------------------------
// Pulse Relay
// ---------------------------------------------------------------------------

/** Index in the schedule of the next Pulse strictly ahead of the current round, or null. */
export function nextUpcomingPulseIndex(d: Draft): number | null {
  const idx = d.cityPulse.schedule.findIndex((e) => e.round > d.round);
  return idx >= 0 ? idx : null;
}

/**
 * Locked rule 4: reroll the next upcoming Pulse (even if already announced)
 * with one boosted category and one different suppressed category, chosen by
 * the seeded RNG. Replaces the previous entry. Never touches an active Pulse.
 */
export function rerollPulse(d: Draft, id: PlayerId): boolean {
  const idx = nextUpcomingPulseIndex(d);
  if (idx === null) return false;
  const previous = d.cityPulse.schedule[idx] as CityPulseEffect;

  const b = nextInt(d.rng, PROPERTY_CATEGORIES.length);
  const boosted = PROPERTY_CATEGORIES[b.value] as Category;
  const others = PROPERTY_CATEGORIES.filter((c) => c !== boosted);
  const s = nextInt(b.rng, others.length);
  const suppressed = others[s.value] as Category;
  d.rng = s.rng;

  const effect: CityPulseEffect = { round: previous.round, boosted, suppressed };
  const schedule = d.cityPulse.schedule.slice();
  schedule[idx] = effect;
  d.cityPulse.schedule = schedule;

  const wasTelegraphed = d.cityPulse.telegraphed.some((e) => e.round === effect.round);
  if (wasTelegraphed) {
    d.cityPulse.telegraphed = d.cityPulse.telegraphed.map((e) => (e.round === effect.round ? effect : e));
  }
  emit(d, { type: 'CITY_PULSE_REROLLED', player: id, previous, effect, wasTelegraphed });
  return true;
}
