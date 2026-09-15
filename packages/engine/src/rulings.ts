/**
 * Engine readings R1–R13 and the A1–A7 rulings.
 *
 * Each entry is a point the Paper Playtest Kit leaves unstated. R1, R3, R4 and
 * R9 (and A1–A7, Q-20) were ruled by the design owner on 14 Sep 2026 and are
 * authoritative; the rest remain the most literal reading of the kit's
 * wording. All are mirrored in docs/GAME_DESIGN_v0.1.md §12 — change them
 * there and here together, with the corresponding tests.
 *
 * Grouped as data so they are visible in one place. Readings that are pure
 * control flow are documented here and implemented where marked with their
 * R-number.
 */

export const RULINGS = {
  /**
   * R1 (locked) — Equal highest auction bids go to the bidder furthest from
   * the Hub = greatest forward distance to tile 0 on the one-way loop; same
   * tile → lower seat. No RNG is consumed. (A1)
   */
  AUCTION_TIE_BREAK: 'furthest_from_hub_then_seat',

  /**
   * R2 — "Last place" (Windfall, Leverage grant) = lowest Net Worth by the kit
   * formula. All players tied for lowest count as last. (A2)
   */
  LAST_PLACE_MEASURE: 'net_worth',
  LAST_PLACE_TIES: 'all_tied_are_last',

  /**
   * R3 (locked) — Leverage tokens: start at 0; no grant in round 1. At the
   * start of rounds 2–12, after interest, every tied-last player receives one
   * token, capped at LEVERAGE_TOKEN_CAP (3). No grant after round 12. (A3)
   */
  LEVERAGE_STARTING_TOKENS: 0,
  LEVERAGE_GRANT_TIMING: 'round_start_after_interest',

  /**
   * R4 (locked) — Ordinary debt accrues floor(debt ÷ 10) at the start of each
   * round (2–12), before the Leverage last-place calculation. No accrual
   * after round 12.
   */
  INTEREST_TIMING: 'round_start',

  /** R5 — A City Pulse stays active until the next replaces it: R4–6, R7–9, R10–12. (A4) */
  PULSE_DURATION: 'until_replaced',

  /** R6 — Force Auction targets one currently unowned property; normal auction rules apply. (A5) */
  FORCE_AUCTION_TARGETS: 'unowned_only',

  /** R7 — Exchange's discounted upgrade replaces the turn's one upgrade; it lapses at turn end. (A6) */
  EXCHANGE_DISCOUNT_SCOPE: 'this_turn_counts_toward_limit',

  /** R8 — Both upgrade levels cost the same and add the same yield (one figure per tier in the kit). */
  UPGRADE_LEVELS_UNIFORM: true,

  /**
   * R9 (locked) — Credit Line: separate ₵200 interest-free balance, added to
   * cash directly. Not incoming income: the 50% ordinary-debt rule does not
   * apply. Deducted from Net Worth (settled at final scoring).
   */
  CREDIT_LINE_IS_INCOMING_MONEY: false,

  /** R10 — Pulse Relay reroll is optional (REROLL_PULSE) during that turn's action window; no effect if no Pulse remains ahead. */
  PULSE_RELAY_OPTIONAL: true,

  /**
   * R11 — Turn: roll two dice → move exactly their sum → resolve landing →
   * action window → end. No upgrades or Leverage before movement.
   * TURN_TIMED_OUT is step-local: the move still happens at `roll`; decline at
   * buy_or_decline; END_TURN in the action window. In an auction, not bidding
   * is "no bid". (A7)
   */
  TIMEOUT_SEMANTICS: 'step_local',

  /** R12 — MATCH_ENDED ranking sorts by Net Worth descending; equal values keep seat order (Q-16 open). */
  RANKING_TIE: 'seat_order',

  /** R13 — Audit is paid to the bank (removed from play). */
  AUDIT_RECIPIENT: 'bank',
} as const;
