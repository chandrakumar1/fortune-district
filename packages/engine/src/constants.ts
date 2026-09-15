/**
 * Fortune District v0.1 — rule constants.
 *
 * Mirrors docs/GAME_DESIGN_v0.1.md §11 and the Paper Playtest Kit
 * (docs/PAPER_PLAYTEST_KIT_v0.1.md). If a value here changes, the design
 * document changes first.
 *
 * Time values are exported for hosts (server, simulator, prototype). The
 * engine itself never reads a clock (ADR-0004).
 */

/** Target match length. Informational for hosts/UI; not enforced by the engine. */
export const MATCH_TARGET_MINUTES = 15;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

export const BOARD_TILE_COUNT = 24;
export const PROPERTY_TILE_COUNT = 18;
/** 24 − 18: District Hub ×1, Pulse Relay ×2, Audit ×1, Exchange ×1, Windfall ×1. */
export const SPECIAL_TILE_COUNT = BOARD_TILE_COUNT - PROPERTY_TILE_COUNT;

export const ROUND_COUNT = 12;

/** Official rule (GD §1). Hosts may use a different value for testing. */
export const TURN_TIMER_SECONDS = 20;
/** Paper Playtest Kit Part 3: 30 s per decision for human playtests. */
export const PLAYTEST_TURN_TIMER_SECONDS = 30;
export const AUCTION_BID_WINDOW_SECONDS = 10;

/** Currency symbol for Fortune Credits. Amounts are integer ₵; round down. */
export const CURRENCY_SYMBOL = '₵';
export const STARTING_CASH = 1200;
export const DISTRICT_HUB_BONUS = 150;

export const PROPERTY_CATEGORIES = [
  'Residential',
  'Tech',
  'Leisure',
  'Industry',
  'Energy',
  'Transit',
] as const;

export const TIER_COUNT = 3;

/** Kit Part 1: purchase price and base yield per tier. */
export const TIER_PRICE = { 1: 100, 2: 180, 3: 260 } as const;
export const TIER_YIELD = { 1: 15, 2: 30, 3: 50 } as const;

/** Kit Part 1: "Upgrade costs: T1 ₵50 (+₵9 yield) · T2 ₵90 (+₵18) · T3 ₵130 (+₵30). Max 2 per property." */
export const UPGRADE_COST = { 1: 50, 2: 90, 3: 130 } as const;
export const UPGRADE_YIELD = { 1: 9, 2: 18, 3: 30 } as const;
export const MAX_UPGRADE_LEVEL = 2;
/** Kit Part 2: "You can buy one upgrade per turn on anything you own." */
export const UPGRADES_PER_TURN = 1;

/** ×2 on a completed category set (all three properties). */
export const SET_BONUS_MULTIPLIER = 2;

/** 25% payment cap, measured against payer cash. Remainder becomes debt. */
export const PAYMENT_CAP_NUMERATOR = 1;
export const PAYMENT_CAP_DENOMINATOR = 4;

/** 10% debt interest per round. */
export const DEBT_INTEREST_NUMERATOR = 1;
export const DEBT_INTEREST_DENOMINATOR = 10;

/** Locked rule 2: 50% of incoming money is applied to ordinary debt. */
export const INCOME_TO_DEBT_NUMERATOR = 1;
export const INCOME_TO_DEBT_DENOMINATOR = 2;

/** Kit: minimum auction bid is half the list price. */
export const AUCTION_MIN_BID_NUMERATOR = 1;
export const AUCTION_MIN_BID_DENOMINATOR = 2;

/** Kit: Audit — "pay 8% of cash". */
export const AUDIT_NUMERATOR = 8;
export const AUDIT_DENOMINATOR = 100;

/** Kit: Exchange — "one upgrade anywhere, 20% off". Pay 80%. */
export const EXCHANGE_PAY_NUMERATOR = 4;
export const EXCHANGE_PAY_DENOMINATOR = 5;

/** Kit: Windfall — "+₵100, or +₵250 if last". */
export const WINDFALL_AMOUNT = 100;
export const WINDFALL_AMOUNT_IF_LAST = 250;

/** Kit: Leverage — "take ₵200 interest-free". Separate balance; not incoming income. */
export const CREDIT_LINE_AMOUNT = 200;
/** Locked 14 Sep 2026: a player holds at most 3 Leverage tokens; grants beyond that are not made. */
export const LEVERAGE_TOKEN_CAP = 3;

/** Movement: two independent 1–6 dice; the player moves exactly their sum. */
export const DIE_SIDES = 6;

/** Rounds at which a City Pulse becomes active. Announced at the start of the preceding round. */
export const CITY_PULSE_ROUNDS = [4, 7, 10] as const;
export const CITY_PULSE_TELEGRAPH_LEAD_ROUNDS = 1;
/** Kit: "one category earns 50% more, another earns 40% less" → ×1.5 and ×0.6. */
export const PULSE_BOOST = { numerator: 3, denominator: 2 } as const;
export const PULSE_SUPPRESS = { numerator: 3, denominator: 5 } as const;
/** Kit: fixed schedule for the two test games. Rerollable via Pulse Relay. */
export const CITY_PULSE_FIXED_SCHEDULE = [
  { round: 4, boosted: 'Tech', suppressed: 'Industry' },
  { round: 7, boosted: 'Leisure', suppressed: 'Energy' },
  { round: 10, boosted: 'Transit', suppressed: 'Tech' },
] as const;
