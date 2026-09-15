/**
 * Money deltas and recap icons derived from events — presentation only.
 * Nothing here computes a rule; it only reads amounts the engine already
 * reported in event payloads.
 */

import type { GameEvent, PlayerId } from '../engine.ts';

export interface MoneyDelta {
  /** Net change in spendable cash. */
  readonly cash: number;
  /** Net change in ordinary debt. */
  readonly debt: number;
  /** Net change in the credit-line balance. */
  readonly credit: number;
}

/** Sum the money effects of `events` on `player`. */
export function moneyDelta(events: readonly GameEvent[], player: PlayerId): MoneyDelta {
  let cash = 0;
  let debt = 0;
  let credit = 0;
  for (const e of events) {
    switch (e.type) {
      case 'HUB_BONUS_PAID':
        if (e.player === player) cash += e.amount;
        break;
      case 'WINDFALL_RECEIVED':
        if (e.player === player) cash += e.amount;
        break;
      case 'PAYMENT_MADE':
        if (e.from === player) cash -= e.paid;
        if (e.to === player) cash += e.paid;
        break;
      case 'DEBT_INCURRED':
        if (e.player === player) debt += e.amount;
        break;
      case 'INTEREST_ACCRUED':
        if (e.player === player) debt += e.amount;
        break;
      case 'DEBT_REPAID':
        // Half of an income went to debt instead of cash.
        if (e.player === player) {
          debt -= e.amount;
          cash -= e.amount;
        }
        break;
      case 'CREDIT_LINE_TAKEN':
        if (e.player === player) {
          cash += e.amount;
          credit += e.amount;
        }
        break;
      default:
        break;
    }
  }
  return { cash, debt, credit };
}

export type RecapTone = 'gain' | 'loss' | 'info' | 'neutral';

/** Icon and tone for a recap line, keyed by event type. */
export function recapMeta(e: GameEvent, me: PlayerId): { readonly icon: string; readonly tone: RecapTone } {
  switch (e.type) {
    case 'HUB_BONUS_PAID':
    case 'WINDFALL_RECEIVED':
      return { icon: '₵', tone: 'gain' };
    case 'PAYMENT_MADE':
      if (e.to === me) return { icon: '₵', tone: 'gain' };
      return { icon: '₵', tone: 'loss' };
    case 'DEBT_INCURRED':
    case 'INTEREST_ACCRUED':
      return { icon: '⚠', tone: 'loss' };
    case 'DEBT_REPAID':
      return { icon: '↓', tone: 'info' };
    case 'PROPERTY_PURCHASED':
    case 'AUCTION_RESOLVED':
      return { icon: '⌂', tone: e.type === 'AUCTION_RESOLVED' && e.winner !== me ? 'neutral' : 'info' };
    case 'PROPERTY_UPGRADED':
      return { icon: '◆', tone: 'info' };
    case 'LEVERAGE_TOKEN_GRANTED':
    case 'CREDIT_LINE_TAKEN':
      return { icon: '◈', tone: 'info' };
    case 'EXCHANGE_DISCOUNT_GRANTED':
      return { icon: '%', tone: 'info' };
    case 'CITY_PULSE_TELEGRAPHED':
    case 'CITY_PULSE_APPLIED':
    case 'CITY_PULSE_REROLLED':
      return { icon: '◉', tone: 'info' };
    case 'TURN_TIMED_OUT':
      return { icon: '⏱', tone: 'loss' };
    default:
      return { icon: '•', tone: 'neutral' };
  }
}
