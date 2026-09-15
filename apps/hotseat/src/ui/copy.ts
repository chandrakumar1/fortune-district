/**
 * Every player-facing string: step labels, tile hints, plain-language errors,
 * "what happened" sentences and neutral log lines. Presentation only —
 * internal engine step names never reach the screen.
 */

import {
  AUCTION_MIN_BID_DENOMINATOR,
  AUCTION_MIN_BID_NUMERATOR,
  AUDIT_DENOMINATOR,
  AUDIT_NUMERATOR,
  CITY_PULSE_ROUNDS,
  CITY_PULSE_TELEGRAPH_LEAD_ROUNDS,
  CREDIT_LINE_AMOUNT,
  DEBT_INTEREST_DENOMINATOR,
  DEBT_INTEREST_NUMERATOR,
  DISTRICT_HUB_BONUS,
  EXCHANGE_PAY_DENOMINATOR,
  EXCHANGE_PAY_NUMERATOR,
  INCOME_TO_DEBT_DENOMINATOR,
  INCOME_TO_DEBT_NUMERATOR,
  LEVERAGE_TOKEN_CAP,
  MAX_UPGRADE_LEVEL,
  PAYMENT_CAP_DENOMINATOR,
  PAYMENT_CAP_NUMERATOR,
  PULSE_BOOST,
  PULSE_SUPPRESS,
  ROUND_COUNT,
  SET_BONUS_MULTIPLIER,
  STARTING_CASH,
  TIER_PRICE,
  TIER_YIELD,
  UPGRADES_PER_TURN,
  UPGRADE_COST,
  UPGRADE_YIELD,
  WINDFALL_AMOUNT,
  WINDFALL_AMOUNT_IF_LAST,
  tileName,
} from '../engine.ts';
import type { GameEvent, PlayerId, PlayerView, RuleViolationCode, Tile } from '../engine.ts';
import type { HostConfig, Snapshot } from '../host.ts';
import { money } from './dom.ts';
import { nameOf } from './theme.ts';

// ---------------------------------------------------------------------------
// Beginner layer (spec §11): glossary for dotted-underline terms and the
// rules card. Every number below is an exported engine constant; every
// sentence restates copy already used in the recap, chips or option rows.
// ---------------------------------------------------------------------------

const pct = (num: number, den: number) => `${Math.round((num / den) * 100)}%`;
const times = (f: { readonly numerator: number; readonly denominator: number }) => `×${f.numerator / f.denominator}`;

export type TermKey = 'yield' | 'cap' | 'debt' | 'credit line' | 'Leverage' | 'Pulse' | 'net worth' | 'upgrade' | 'auction' | 'last place';

/** One-line explanations for the spec's tooltip terms (§3 Tooltip, §11). */
export const TERMS: Readonly<Record<TermKey, string>> = {
  yield: `What a property pays its owner when an opponent lands on it. Owning every property of a category pays ${times({ numerator: SET_BONUS_MULTIPLIER, denominator: 1 })}; an active City Pulse can boost or suppress a category.`,
  cap: `Payments are capped at ${PAYMENT_CAP_NUMERATOR}/${PAYMENT_CAP_DENOMINATOR} of your cash; the rest becomes debt.`,
  debt: `Owed. Grows ${pct(DEBT_INTEREST_NUMERATOR, DEBT_INTEREST_DENOMINATOR)} at the start of each round; ${INCOME_TO_DEBT_NUMERATOR}/${INCOME_TO_DEBT_DENOMINATOR} of any money you receive repays it automatically. Counts against your net worth.`,
  'credit line': `Interest-free ${money(CREDIT_LINE_AMOUNT)} from Leverage; counts against your net worth at the end.`,
  Leverage: `Leverage tokens: force an auction on an unowned property, or take a ${money(CREDIT_LINE_AMOUNT)} credit line. Whoever is last at the start of a round receives one (at most ${LEVERAGE_TOKEN_CAP}).`,
  Pulse: `City Pulse: in rounds ${CITY_PULSE_ROUNDS.join(', ')} one category earns ${times(PULSE_BOOST)} and another ${times(PULSE_SUPPRESS)}, announced ${CITY_PULSE_TELEGRAPH_LEAD_ROUNDS} round ahead. A Pulse Relay lets you reroll the next announced Pulse.`,
  'net worth': `Cash + what you paid for property and upgrades − debt − credit line. Highest after round ${ROUND_COUNT} wins.`,
  upgrade: `Raises what that property pays you. ${UPGRADES_PER_TURN} upgrade per turn, ${MAX_UPGRADE_LEVEL} per property.`,
  auction: `Sealed bids: everyone (including you) bids once in secret. Minimum bid is ${AUCTION_MIN_BID_NUMERATOR}/${AUCTION_MIN_BID_DENOMINATOR} of the list price; highest wins; a tie goes to the bidder furthest from the Hub. Nobody bids — it stays unowned.`,
  'last place': 'Lowest net worth; ties all count as last. Whoever is last at the start of a round receives a Leverage token.',
};

export interface RulesSection {
  readonly title: string;
  readonly lines: readonly string[];
}

/** The persistent "?" rules card (§11). Timer lines reflect the match's own config. */
export function rulesSections(config: HostConfig): readonly RulesSection[] {
  const tiers = [1, 2, 3] as const;
  return [
    {
      title: 'Goal',
      lines: [
        `${ROUND_COUNT} rounds. Highest net worth after round ${ROUND_COUNT} wins.`,
        'Net worth = cash + property prices paid + upgrades paid − debt − credit line.',
        `Everyone starts with ${money(STARTING_CASH)}.`,
      ],
    },
    {
      title: 'Your turn',
      lines: [
        'The dice are rolled for you (two dice, added together). Move that many tiles clockwise.',
        `Pass or land on the District Hub: +${money(DISTRICT_HUB_BONUS)}.`,
        'Land on an unowned property: buy it at its price, or send it to a sealed auction.',
        `Land on an opponent's property: pay them its yield. ${TERMS.cap}`,
        `Then, optionally: one upgrade, and Leverage if you hold a token. End your turn.`,
        config.decisionSeconds === null
          ? 'No timer in this match.'
          : `${config.decisionSeconds} seconds per decision${config.auctionSeconds !== null ? `, ${config.auctionSeconds} seconds per bid` : ''}. If time runs out the game acts for you: your move is made, the property is sent to auction, or your turn is ended.`,
      ],
    },
    {
      title: 'Properties and yield',
      lines: [
        `Tier prices ${tiers.map((t) => money(TIER_PRICE[t])).join(' / ')}; they pay ${tiers.map((t) => money(TIER_YIELD[t])).join(' / ')} when an opponent lands there.`,
        `Owning every property of a category pays ${times({ numerator: SET_BONUS_MULTIPLIER, denominator: 1 })}.`,
        `Upgrades cost ${tiers.map((t) => money(UPGRADE_COST[t])).join(' / ')} by tier and add ${tiers.map((t) => money(UPGRADE_YIELD[t])).join(' / ')} to the yield per level. ${TERMS.upgrade}`,
      ],
    },
    {
      title: 'Auctions',
      lines: [TERMS.auction],
    },
    {
      title: 'Debt',
      lines: [TERMS.debt],
    },
    {
      title: 'Leverage',
      lines: [TERMS.Leverage, TERMS['credit line'], TERMS['last place']],
    },
    {
      title: 'City Pulse',
      lines: [TERMS.Pulse],
    },
    {
      title: 'Special tiles',
      lines: [
        `District Hub: +${money(DISTRICT_HUB_BONUS)} when you pass or land.`,
        'Pulse Relay: reroll the next City Pulse.',
        `Audit: pay ${pct(AUDIT_NUMERATOR, AUDIT_DENOMINATOR)} of your cash.`,
        `Exchange: one upgrade at ${pct(EXCHANGE_PAY_NUMERATOR, EXCHANGE_PAY_DENOMINATOR)} of its cost (${100 - Math.round((EXCHANGE_PAY_NUMERATOR / EXCHANGE_PAY_DENOMINATOR) * 100)}% off) this turn.`,
        `Windfall: +${money(WINDFALL_AMOUNT)}, or +${money(WINDFALL_AMOUNT_IF_LAST)} if you are last.`,
      ],
    },
  ];
}

/** Player-facing name for the current decision. Internal step names never appear. */
export function stepLabel(snap: Snapshot): string {
  const s = snap.view!.state;
  if (s.phase.kind === 'auction') return 'Place your bid';
  if (s.phase.kind !== 'turn') return '';
  switch (s.phase.step.kind) {
    case 'roll': return 'Make your move';
    case 'buy_or_decline': return 'Buy or send to auction';
    case 'actions': return 'Optional actions, then end your turn';
  }
}

/** Display hints taken from the kit's tile column; not rule logic. */
export function specialHint(t: Tile): string {
  switch (t.kind) {
    case 'district_hub': return '+₵150 when you pass or land';
    case 'pulse_relay': return 'reroll the next City Pulse';
    case 'audit': return 'pay 8% of your cash';
    case 'exchange': return 'one upgrade at 20% off';
    case 'windfall': return '+₵100, or +₵250 if you are last';
    default: return '';
  }
}

/** Whether an event is worth telling `me` about in the recap. */
export function concerns(e: GameEvent, me: PlayerId): boolean {
  switch (e.type) {
    case 'PAYMENT_MADE': return e.from === me || e.to === me;
    case 'HUB_BONUS_PAID': case 'DEBT_INCURRED': case 'INTEREST_ACCRUED': case 'DEBT_REPAID': case 'WINDFALL_RECEIVED':
    case 'EXCHANGE_DISCOUNT_GRANTED': case 'LEVERAGE_TOKEN_GRANTED': case 'TURN_TIMED_OUT': case 'PROPERTY_PURCHASED': case 'PROPERTY_UPGRADED':
      return e.player === me;
    case 'AUCTION_RESOLVED': case 'CITY_PULSE_TELEGRAPHED': case 'CITY_PULSE_APPLIED': case 'CITY_PULSE_REROLLED': case 'ROUND_ENDED':
      return true;
    default: return false;
  }
}

export function tellMe(e: GameEvent, view: PlayerView, me: PlayerId): string | null {
  const n = (id: PlayerId | null) => (id === me ? 'you' : nameOf(view, id));
  const t = (i: number) => tileName(view.state.board[i]!);
  switch (e.type) {
    case 'HUB_BONUS_PAID': return `You passed the District Hub: +${money(e.amount)}.`;
    case 'PAYMENT_MADE':
      if (e.reason === 'yield' && e.to !== null) {
        if (e.from === me) return e.capped
          ? `You paid ${n(e.to)} ${money(e.paid)} of ${money(e.requested)} — payments are capped at a quarter of your cash; the rest became debt.`
          : `You paid ${n(e.to)} ${money(e.paid)} for landing on their property.`;
        if (e.to === me) return `${nameOf(view, e.from)} landed on your property and paid you ${money(e.paid)}${e.capped ? ` (capped; the rest became their debt)` : ''}.`;
        return null;
      }
      if (e.reason === 'audit') return `Audit: you paid ${money(e.paid)} (8% of your cash).`;
      if (e.reason === 'purchase') return null; // covered by PROPERTY_PURCHASED
      if (e.reason === 'auction') return null; // covered by AUCTION_RESOLVED
      if (e.reason === 'upgrade') return null; // covered by PROPERTY_UPGRADED
      return null;
    case 'DEBT_INCURRED': return `${money(e.amount)} was added to your debt. Debt grows 10% at the start of each round and counts against your net worth.`;
    case 'DEBT_REPAID': return `Half of that income (${money(e.amount)}) automatically repaid your debt.`;
    case 'INTEREST_ACCRUED': return `Interest: your debt grew by ${money(e.amount)}.`;
    case 'WINDFALL_RECEIVED': return e.wasLast ? `Windfall: +${money(e.amount)} because you are in last place.` : `Windfall: +${money(e.amount)}.`;
    case 'EXCHANGE_DISCOUNT_GRANTED': return 'Exchange: one upgrade is 20% off this turn.';
    case 'LEVERAGE_TOKEN_GRANTED': return 'You are in last place, so you received 1 Leverage token.';
    case 'PROPERTY_PURCHASED': return `You bought ${t(e.tileIndex)} for ${money(e.price)}.`;
    case 'PROPERTY_UPGRADED': return `You upgraded ${t(e.tileIndex)} to level ${e.level} for ${money(e.cost)}${e.exchangeDiscount ? ' (Exchange discount)' : ''}.`;
    case 'AUCTION_RESOLVED':
      if (e.winner === null) return `Nobody bid for ${t(e.tileIndex)} — it stays unowned.`;
      return `${e.winner === me ? 'You' : nameOf(view, e.winner)} won ${t(e.tileIndex)} at auction for ${money(e.winningBid ?? 0)}${e.tieBroken ? ' (tie: furthest from the Hub)' : ''}.`;
    case 'CITY_PULSE_TELEGRAPHED': return `City Pulse announced for round ${e.effect.round}: ${e.effect.boosted} will earn ×1.5, ${e.effect.suppressed} ×0.6.`;
    case 'CITY_PULSE_APPLIED': return `City Pulse is now active: ${e.effect.boosted} earn ×1.5, ${e.effect.suppressed} ×0.6.`;
    case 'CITY_PULSE_REROLLED': return `${e.player === me ? 'You' : nameOf(view, e.player)} rerolled the round-${e.effect.round} Pulse: now ${e.effect.boosted} ×1.5, ${e.effect.suppressed} ×0.6.`;
    case 'TURN_TIMED_OUT':
      switch (e.step) {
        case 'roll': return 'Time ran out — your move was made for you.';
        case 'buy_or_decline': return 'Time ran out — the property was sent to auction for you.';
        case 'actions': return 'Time ran out — your turn was ended for you.';
      }
      return null;
    case 'ROUND_ENDED': return `Round ${e.round} ended.`;
    default: return null;
  }
}

export function plainError(code: RuleViolationCode, engineMessage: string): string {
  switch (code) {
    case 'INSUFFICIENT_FUNDS': return `You don't have enough cash for that. (${engineMessage})`;
    case 'NOT_YOUR_TURN': return "It isn't your turn right now.";
    case 'WRONG_PHASE': return 'That action is not available at this point of the turn.';
    case 'PROPERTY_NOT_AVAILABLE': return 'That property cannot be bought right now.';
    case 'NOT_ELIGIBLE_TO_BID': return 'You cannot bid in this auction.';
    case 'INVALID_BID': return `That bid is not allowed — bids must be whole ₵, at least the minimum, and no more than your cash. (${engineMessage})`;
    case 'UPGRADE_NOT_ALLOWED': return `You cannot upgrade that now. (${engineMessage})`;
    case 'NO_LEVERAGE_TOKENS': return 'You have no Leverage tokens to spend.';
    case 'INVALID_LEVERAGE_TARGET': return 'Force Auction only works on a property nobody owns yet.';
    case 'REROLL_NOT_AVAILABLE': return 'You can only reroll the Pulse right after landing on a Pulse Relay.';
    case 'INVALID_PLAYER_COUNT': return 'Fortune District needs 2 to 4 players.';
    case 'MATCH_ALREADY_STARTED': return 'The match has already started.';
    case 'MATCH_ENDED': return 'The match is over.';
    case 'UNKNOWN_COMMAND': return 'That action was not understood.';
    default: return engineMessage;
  }
}

export function describe(e: GameEvent, view: PlayerView): string {
  const n = (id: PlayerId | null) => nameOf(view, id);
  const t = (i: number) => tileName(view.state.board[i]!);
  switch (e.type) {
    case 'MATCH_STARTED': return `Match started. Turn order: ${e.seatOrder.map((id) => n(id)).join(', ')}`;
    case 'TURN_STARTED': return `${n(e.player)}'s turn`;
    case 'DICE_ROLLED': return `${n(e.player)} rolled ${e.dice[0]} + ${e.dice[1]} = ${e.dice[0] + e.dice[1]}`;
    case 'PLAYER_MOVED': return `${n(e.player)} moved ${e.steps} → ${t(e.to)}`;
    case 'HUB_BONUS_PAID': return `${n(e.player)} receives ${money(e.amount)} from the Hub`;
    case 'PROPERTY_OFFERED': return `${t(e.tileIndex)} offered to ${n(e.player)}`;
    case 'PROPERTY_PURCHASED': return `${n(e.player)} bought ${t(e.tileIndex)} for ${money(e.price)}`;
    case 'PROPERTY_DECLINED': return `${n(e.player)} sent ${t(e.tileIndex)} to auction`;
    case 'AUCTION_OPENED': return `Auction: ${t(e.tileIndex)} (min ${money(e.minimumBid)})`;
    case 'BID_RECEIVED': return `${n(e.bidder)} sealed a bid`;
    case 'AUCTION_RESOLVED':
      return e.winner
        ? `${n(e.winner)} wins ${t(e.tileIndex)} for ${money(e.winningBid ?? 0)}${e.tieBroken ? ' (tie: furthest from Hub)' : ''}. Bids: ${Object.entries(e.revealedBids).map(([id, amt]) => `${n(id)} ${money(amt)}`).join(', ') || 'none'}`
        : `Nobody bid for ${t(e.tileIndex)} — stays unowned`;
    case 'PAYMENT_MADE':
      return e.to === null
        ? `${n(e.from)} paid ${money(e.paid)} (${e.reason})`
        : `${n(e.from)} paid ${n(e.to)} ${money(e.paid)}${e.capped ? ` of ${money(e.requested)} (25% cap)` : ''}`;
    case 'DEBT_INCURRED': return `${n(e.player)} takes on ${money(e.amount)} debt`;
    case 'INTEREST_ACCRUED': return `${n(e.player)}: ${money(e.amount)} interest`;
    case 'DEBT_REPAID': return `${n(e.player)}: ${money(e.amount)} of ${e.source} income repays debt`;
    case 'PROPERTY_UPGRADED': return `${n(e.player)} upgraded ${t(e.tileIndex)} to L${e.level} for ${money(e.cost)}${e.exchangeDiscount ? ' (Exchange)' : ''}`;
    case 'WINDFALL_RECEIVED': return `${n(e.player)} Windfall ${money(e.amount)}${e.wasLast ? ' (last place)' : ''}`;
    case 'EXCHANGE_DISCOUNT_GRANTED': return `${n(e.player)} may upgrade at 20% off this turn`;
    case 'LEVERAGE_TOKEN_GRANTED': return `${n(e.player)} receives a Leverage token (last place, ${money(e.netWorth)})`;
    case 'LEVERAGE_TOKEN_USED': return `${n(e.player)} spends Leverage: ${e.payload.kind === 'credit_line' ? 'credit line' : `force auction on ${t(e.payload.tileIndex)}`}`;
    case 'CREDIT_LINE_TAKEN': return `${n(e.player)} takes ${money(e.amount)} credit line`;
    case 'CITY_PULSE_TELEGRAPHED': return `City Pulse announced for round ${e.effect.round}: ${e.effect.boosted} ×1.5, ${e.effect.suppressed} ×0.6`;
    case 'CITY_PULSE_REROLLED': return `${n(e.player)} rerolled the round-${e.effect.round} Pulse → ${e.effect.boosted} ×1.5, ${e.effect.suppressed} ×0.6`;
    case 'CITY_PULSE_APPLIED': return `City Pulse active: ${e.effect.boosted} ×1.5, ${e.effect.suppressed} ×0.6`;
    case 'TURN_TIMED_OUT': return `${n(e.player)} ran out of time`;
    case 'TURN_ENDED': return `${n(e.player)} ended their turn`;
    case 'ROUND_ENDED': return `— end of round ${e.round} —`;
    case 'MATCH_ENDED': return `Match over. ${e.ranking.map((r, i) => `${i + 1}. ${n(r.player)} ${money(r.netWorth)}`).join(' · ')}`;
    default: return (e as { type: string }).type;
  }
}
