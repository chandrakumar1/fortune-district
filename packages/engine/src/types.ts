/**
 * Fortune District v0.1 — engine type contracts.
 *
 * Rules:
 *  - Everything in GameState must be JSON-serialisable plain data (ADR-0001).
 *  - No `enum`, `namespace`, or parameter properties (erasable syntax only).
 *  - Readings the design/kit leave open are centralised in ./rulings.ts and
 *    referenced here by their R-number; see docs/GAME_DESIGN_v0.1.md §12.
 */

import type { PROPERTY_CATEGORIES } from './constants.ts';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Integer Fortune Credits (₵). Never negative in `cash`, `debt`, `creditLine`. */
export type Credits = number;

export type PlayerId = string;
export type MatchId = string;

/** 0-based position on the 24-tile loop. */
export type TileIndex = number;

/** Seat order index, 0-based. Assigned by seeded shuffle at START_MATCH. */
export type Seat = number;

export type Category = (typeof PROPERTY_CATEGORIES)[number];

/** Three tiers: T1 / T2 / T3 (kit names). */
export type Tier = 1 | 2 | 3;

/** Who issued a command. `'host'` = server, simulator or prototype acting on the clock. */
export type Actor = PlayerId | 'host';

export type PulseRound = 4 | 7 | 10;

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export interface PropertyTile {
  readonly kind: 'property';
  readonly index: TileIndex;
  readonly name: string;
  readonly category: Category;
  readonly tier: Tier;
  readonly price: Credits;
  readonly baseYield: Credits;
}

export interface DistrictHubTile {
  readonly kind: 'district_hub';
  readonly index: TileIndex;
}

export interface PulseRelayTile {
  readonly kind: 'pulse_relay';
  readonly index: TileIndex;
}

export interface AuditTile {
  readonly kind: 'audit';
  readonly index: TileIndex;
}

export interface ExchangeTile {
  readonly kind: 'exchange';
  readonly index: TileIndex;
}

export interface WindfallTile {
  readonly kind: 'windfall';
  readonly index: TileIndex;
}

export type SpecialTile = DistrictHubTile | PulseRelayTile | AuditTile | ExchangeTile | WindfallTile;
export type Tile = PropertyTile | SpecialTile;

/** Exactly 24 tiles, index === array position. */
export type Board = readonly Tile[];

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export interface PlayerState {
  readonly id: PlayerId;
  readonly seat: Seat;
  readonly displayName: string;
  readonly cash: Credits;
  /** Ordinary (interest-bearing) debt. */
  readonly debt: Credits;
  /** Interest-free balance from the Leverage Credit Line (R9). Deducted from Net Worth. */
  readonly creditLine: Credits;
  readonly leverageTokens: number;
  readonly position: TileIndex;
  /** Maintained by the host. The engine does not read it in v0.1. */
  readonly connected: boolean;
}

// ---------------------------------------------------------------------------
// Turn sub-steps
// ---------------------------------------------------------------------------

export type TurnStep =
  /** Two dice rolled at turn start; the player moves exactly their sum (ADVANCE). */
  | { readonly kind: 'roll'; readonly dice: readonly [number, number] }
  /** Landed on an unowned property; waiting for buy / decline. */
  | { readonly kind: 'buy_or_decline'; readonly tileIndex: TileIndex }
  /** Post-move action window: one upgrade, Leverage, Pulse Relay reroll, end turn. */
  | {
      readonly kind: 'actions';
      readonly upgradesThisTurn: number;
      /** True this turn only after landing on Exchange (R7). */
      readonly exchangeDiscount: boolean;
      /** True this turn only after landing on Pulse Relay and while a Pulse remains ahead (R10). */
      readonly pulseRelayAvailable: boolean;
    };

// ---------------------------------------------------------------------------
// Auction (sealed-bid, 10 s window)
// ---------------------------------------------------------------------------

export interface AuctionState {
  readonly tileIndex: TileIndex;
  /** Player whose turn it is (the decliner, or the Leverage user). */
  readonly openedBy: PlayerId;
  readonly origin: 'decline' | 'leverage';
  /** Everyone, including the decliner (locked rule 3). */
  readonly eligible: readonly PlayerId[];
  readonly minimumBid: Credits;
  /**
   * HIDDEN. Stripped by projectForPlayer for everyone except the bidder's own
   * entry. Never broadcast.
   */
  readonly bids: Readonly<Record<PlayerId, Credits>>;
}

// ---------------------------------------------------------------------------
// City Pulse (rounds 4, 7, 10 — telegraphed one round ahead)
// ---------------------------------------------------------------------------

export interface CityPulseEffect {
  readonly round: PulseRound;
  readonly boosted: Category;
  readonly suppressed: Category;
}

export interface CityPulseState {
  /** Three entries, one per Pulse round. Entries ahead of the current round may be rerolled. */
  readonly schedule: readonly CityPulseEffect[];
  /** Effects announced to players but not yet applied. */
  readonly telegraphed: readonly CityPulseEffect[];
  /** Effects already applied, in order. Length is 3 at match end. */
  readonly applied: readonly CityPulseEffect[];
  /** Effect currently modifying yields; persists until replaced (R5). */
  readonly active: CityPulseEffect | null;
}

// ---------------------------------------------------------------------------
// Phase machine (ARCHITECTURE §3.4)
// ---------------------------------------------------------------------------

export type Phase =
  | { readonly kind: 'lobby' }
  | { readonly kind: 'turn'; readonly activePlayer: PlayerId; readonly step: TurnStep }
  | {
      readonly kind: 'auction';
      readonly returnTo: PlayerId;
      /** Turn step to resume after CLOSE_AUCTION. */
      readonly resumeStep: TurnStep;
    }
  | { readonly kind: 'ended' };
// v1.1 will add { kind: 'exchange' } here. Not in v1.

// ---------------------------------------------------------------------------
// Randomness (ADR-0001 §Determinism)
// ---------------------------------------------------------------------------

/**
 * Counter-based PRNG state. Draw n = mix(seed, counter + n). Advancing
 * produces a new RngState; the old one is never mutated.
 */
export interface RngState {
  readonly seed: number;
  readonly counter: number;
}

// ---------------------------------------------------------------------------
// Match configuration
// ---------------------------------------------------------------------------

export interface MatchConfig {
  readonly matchId: MatchId;
  readonly seed: number;
  /** 2–4 entries. Seat order is assigned by seeded shuffle at START_MATCH. */
  readonly players: readonly { readonly id: PlayerId; readonly displayName: string }[];
}

// ---------------------------------------------------------------------------
// Game state (authoritative, full information)
// ---------------------------------------------------------------------------

export interface GameState {
  readonly matchId: MatchId;
  readonly config: MatchConfig;
  readonly rng: RngState;

  /** 1..12. */
  readonly round: number;
  /** Index into seat order within the current round. */
  readonly turnInRound: number;
  readonly phase: Phase;

  readonly board: Board;
  /** In seat order once the match has started. */
  readonly players: readonly PlayerState[];
  /** tileIndex → owner. Absent key = unowned. */
  readonly ownership: Readonly<Record<TileIndex, PlayerId>>;
  /** tileIndex → upgrade level (0..MAX_UPGRADE_LEVEL). Absent = 0. */
  readonly upgrades: Readonly<Record<TileIndex, number>>;
  /** tileIndex → price actually paid by the current owner (Net Worth: "prices paid"). */
  readonly pricePaid: Readonly<Record<TileIndex, Credits>>;
  /** tileIndex → total upgrade ₵ actually paid by the current owner (Net Worth: "upgrades paid"). */
  readonly upgradeSpend: Readonly<Record<TileIndex, Credits>>;

  readonly auction: AuctionState | null;
  readonly cityPulse: CityPulseState;

  /** Append-only. */
  readonly eventLog: readonly GameEvent[];
  /** Next event sequence number. */
  readonly nextSeq: number;
}

/**
 * What one player is allowed to see. Identical to GameState except hidden
 * information is removed; declared as a distinct type so the server cannot
 * pass a GameState where a view is expected.
 */
export interface PlayerView {
  readonly viewer: PlayerId;
  readonly state: Omit<GameState, 'auction' | 'rng'> & {
    readonly auction: (Omit<AuctionState, 'bids'> & { readonly myBid: Credits | null }) | null;
  };
}

// ---------------------------------------------------------------------------
// Commands (RULES_ENGINE_SPEC §3)
// ---------------------------------------------------------------------------

interface BaseCommand {
  readonly by: Actor;
}

export type LeveragePayload =
  | { readonly kind: 'force_auction'; readonly tileIndex: TileIndex }
  | { readonly kind: 'credit_line' };

export type Command =
  | (BaseCommand & { readonly type: 'START_MATCH' })
  | (BaseCommand & { readonly type: 'ADVANCE' }) // move by the sum of the rolled dice
  | (BaseCommand & { readonly type: 'BUY_PROPERTY'; readonly tileIndex: TileIndex })
  | (BaseCommand & { readonly type: 'DECLINE_PROPERTY'; readonly tileIndex: TileIndex })
  | (BaseCommand & { readonly type: 'UPGRADE_PROPERTY'; readonly tileIndex: TileIndex })
  | (BaseCommand & { readonly type: 'USE_LEVERAGE_TOKEN'; readonly payload: LeveragePayload })
  | (BaseCommand & { readonly type: 'REROLL_PULSE' })
  | (BaseCommand & { readonly type: 'END_TURN' })
  | (BaseCommand & { readonly type: 'TURN_TIMED_OUT' }) // host only; step-local defaults (R11)
  | (BaseCommand & { readonly type: 'SUBMIT_SEALED_BID'; readonly amount: Credits })
  | (BaseCommand & { readonly type: 'CLOSE_AUCTION' }); // host only

export type CommandType = Command['type'];

// ---------------------------------------------------------------------------
// Events (RULES_ENGINE_SPEC §4)
// ---------------------------------------------------------------------------

interface BaseEvent {
  readonly seq: number;
  readonly round: number;
}

export type GameEvent =
  | (BaseEvent & { readonly type: 'MATCH_STARTED'; readonly seatOrder: readonly PlayerId[] })
  | (BaseEvent & { readonly type: 'TURN_STARTED'; readonly player: PlayerId })
  | (BaseEvent & { readonly type: 'DICE_ROLLED'; readonly player: PlayerId; readonly dice: readonly [number, number] })
  | (BaseEvent & {
      readonly type: 'PLAYER_MOVED';
      readonly player: PlayerId;
      readonly from: TileIndex;
      readonly to: TileIndex;
      /** Always dice[0] + dice[1]. */
      readonly steps: number;
      readonly dice: readonly [number, number];
    })
  | (BaseEvent & { readonly type: 'HUB_BONUS_PAID'; readonly player: PlayerId; readonly amount: Credits })
  | (BaseEvent & { readonly type: 'PROPERTY_OFFERED'; readonly player: PlayerId; readonly tileIndex: TileIndex })
  | (BaseEvent & {
      readonly type: 'PROPERTY_PURCHASED';
      readonly player: PlayerId;
      readonly tileIndex: TileIndex;
      readonly price: Credits;
    })
  | (BaseEvent & { readonly type: 'PROPERTY_DECLINED'; readonly player: PlayerId; readonly tileIndex: TileIndex })
  | (BaseEvent & {
      readonly type: 'AUCTION_OPENED';
      readonly tileIndex: TileIndex;
      readonly origin: 'decline' | 'leverage';
      readonly eligible: readonly PlayerId[];
      readonly minimumBid: Credits;
    })
  /** Public form: no amount. Amounts are revealed by AUCTION_RESOLVED. */
  | (BaseEvent & { readonly type: 'BID_RECEIVED'; readonly bidder: PlayerId })
  | (BaseEvent & {
      readonly type: 'AUCTION_RESOLVED';
      readonly tileIndex: TileIndex;
      readonly winner: PlayerId | null;
      readonly winningBid: Credits | null;
      readonly revealedBids: Readonly<Record<PlayerId, Credits>>;
      /** True when equal highest bids were resolved by furthest-from-Hub, then seat order (R1). */
      readonly tieBroken: boolean;
    })
  | (BaseEvent & {
      readonly type: 'PAYMENT_MADE';
      readonly from: PlayerId;
      /** `null` = paid to the bank / removed from play. */
      readonly to: PlayerId | null;
      readonly requested: Credits;
      readonly paid: Credits;
      /** True when the 25% cap reduced `paid` below `requested`. */
      readonly capped: boolean;
      readonly reason: 'yield' | 'audit' | 'purchase' | 'auction' | 'upgrade';
    })
  | (BaseEvent & { readonly type: 'DEBT_INCURRED'; readonly player: PlayerId; readonly amount: Credits; readonly reason: 'capped_payment' })
  | (BaseEvent & { readonly type: 'INTEREST_ACCRUED'; readonly player: PlayerId; readonly amount: Credits })
  /** Locked rule 2: 50% of incoming money applied to ordinary debt. */
  | (BaseEvent & {
      readonly type: 'DEBT_REPAID';
      readonly player: PlayerId;
      readonly amount: Credits;
      readonly source: 'hub' | 'yield' | 'windfall';
    })
  | (BaseEvent & {
      readonly type: 'PROPERTY_UPGRADED';
      readonly player: PlayerId;
      readonly tileIndex: TileIndex;
      readonly level: number;
      readonly cost: Credits;
      readonly exchangeDiscount: boolean;
    })
  | (BaseEvent & { readonly type: 'WINDFALL_RECEIVED'; readonly player: PlayerId; readonly amount: Credits; readonly wasLast: boolean })
  | (BaseEvent & { readonly type: 'EXCHANGE_DISCOUNT_GRANTED'; readonly player: PlayerId })
  | (BaseEvent & { readonly type: 'LEVERAGE_TOKEN_GRANTED'; readonly player: PlayerId; readonly netWorth: Credits })
  | (BaseEvent & { readonly type: 'LEVERAGE_TOKEN_USED'; readonly player: PlayerId; readonly payload: LeveragePayload })
  | (BaseEvent & { readonly type: 'CREDIT_LINE_TAKEN'; readonly player: PlayerId; readonly amount: Credits })
  | (BaseEvent & { readonly type: 'CITY_PULSE_TELEGRAPHED'; readonly effect: CityPulseEffect })
  | (BaseEvent & {
      readonly type: 'CITY_PULSE_REROLLED';
      readonly player: PlayerId;
      readonly previous: CityPulseEffect;
      readonly effect: CityPulseEffect;
      readonly wasTelegraphed: boolean;
    })
  | (BaseEvent & { readonly type: 'CITY_PULSE_APPLIED'; readonly effect: CityPulseEffect })
  | (BaseEvent & { readonly type: 'TURN_TIMED_OUT'; readonly player: PlayerId; readonly step: TurnStep['kind'] })
  | (BaseEvent & { readonly type: 'TURN_ENDED'; readonly player: PlayerId })
  | (BaseEvent & { readonly type: 'ROUND_ENDED' })
  | (BaseEvent & {
      readonly type: 'MATCH_ENDED';
      /** Descending by netWorth; equal Net Worth keeps seat order (R12). */
      readonly ranking: readonly { readonly player: PlayerId; readonly netWorth: Credits }[];
    });

export type GameEventType = GameEvent['type'];

// ---------------------------------------------------------------------------
// Results (RULES_ENGINE_SPEC §5)
// ---------------------------------------------------------------------------

export type RuleViolationCode =
  | 'NOT_YOUR_TURN'
  | 'WRONG_PHASE'
  | 'UNKNOWN_COMMAND'
  | 'INSUFFICIENT_FUNDS'
  | 'PROPERTY_NOT_AVAILABLE'
  | 'NOT_ELIGIBLE_TO_BID'
  | 'INVALID_BID'
  | 'UPGRADE_NOT_ALLOWED'
  | 'NO_LEVERAGE_TOKENS'
  | 'INVALID_LEVERAGE_TARGET'
  | 'REROLL_NOT_AVAILABLE'
  | 'INVALID_PLAYER_COUNT'
  | 'MATCH_ALREADY_STARTED'
  | 'MATCH_ENDED';

export interface RuleViolation {
  readonly code: RuleViolationCode;
  readonly message: string;
  readonly command: Command;
}

export type ApplyResult =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly error: RuleViolation };

// ---------------------------------------------------------------------------
// Engine API surface
// ---------------------------------------------------------------------------

export interface Engine {
  createInitialState(config: MatchConfig): GameState;
  applyCommand(state: GameState, command: Command): ApplyResult;
  projectForPlayer(state: GameState, viewer: PlayerId): PlayerView;
  whoseDecision(state: GameState): Actor | null;
  legalCommands(state: GameState, actor: Actor): readonly Command[];
  computeNetWorth(state: GameState, player: PlayerId): Credits;
  hashState(state: GameState): string;
}
