# Rules Engine Specification — `@fortune-district/engine`

Defines the contract the Phase 1 engine implements. Everything here derives from [GAME_DESIGN_v0.1.md](GAME_DESIGN_v0.1.md). Type definitions live in `packages/engine/src/types.ts` and are the normative form of the shapes below.

---

## 1. Public API

| Function | Purpose |
|---|---|
| `createInitialState(config)` | Builds the `lobby`-phase state: fixed board, players in config order with ₵1,200, rng seeded from `config.seed`. |
| `applyCommand(state, command)` | The reducer. Pure. Returns new state + events, or a `RuleViolation`. |
| `legalCommands(state, actor)` | Commands the actor may issue now. For sealed bids, one template at the minimum bid is returned; any integer in [minimum, cash] is legal. |
| `whoseDecision(state)` | Which actor must act next: the active player; during an auction, the next eligible bidder who can afford the minimum and has not bid, else `'host'`; `null` when ended. |
| `computeNetWorth(state, playerId)` | Net Worth per GD §8. Single source of truth for scoring. |
| `projectForPlayer(state, playerId)` | Redacts hidden information (other players' sealed bids, the rng) for one viewer. |
| `hashState(state)` | Stable hash (FNV-1a over the JSON of the state minus the event log) for determinism tests and desync detection. |

Also exported: `BOARD`, `tileName`, `categoryTiles`, `yieldFor`, `upgradeCost`, `minimumBidFor`, `RULINGS`, the PRNG (`createRng`, `nextInt`, `rollDie`, `shuffle`) and all constants.

All functions are synchronous and side-effect free.

---

## 2. State model

```
GameState
├── matchId
├── config           (player list, seed — immutable after START_MATCH)
├── rng              { seed, counter } — advanced by any random draw
├── round            1..12
├── turnInRound      index into seat order
├── phase            lobby | turn { activePlayer, step } | auction { returnTo, resumeStep } | ended
├── board[24]        Tile[] — property | district_hub | pulse_relay | audit | exchange | windfall
├── players[]        PlayerState[] in seat order
├── ownership        tileIndex → PlayerId
├── upgrades         tileIndex → level (0..2)
├── pricePaid        tileIndex → ₵ paid by the current owner
├── upgradeSpend     tileIndex → ₵ spent on upgrades by the current owner
├── auction | null   AuctionState during 'auction' phase
├── cityPulse        { schedule[3], telegraphed[], applied[], active }
└── eventLog[]       GameEvent[] (append-only)
```

```
TurnStep
├── roll             { dice: [d1, d2] }          dice rolled at turn start; ADVANCE moves d1 + d2
├── buy_or_decline   { tileIndex }               landed on an unowned property
└── actions          { upgradesThisTurn, exchangeDiscount, pulseRelayAvailable }
```

```
PlayerState
├── id, seat, displayName
├── cash             ₵ ≥ 0
├── debt             ₵ ≥ 0   ordinary (interest-bearing)
├── creditLine       ₵ ≥ 0   Leverage Credit Line, interest-free (R9)
├── leverageTokens   count
├── position         0..23
└── connected        host-maintained flag (engine does not read it)
```

```
AuctionState
├── tileIndex, openedBy, origin ('decline' | 'leverage'), minimumBid
├── eligible         PlayerId[]     everyone, including the decliner
└── bids             PlayerId → ₵   (HIDDEN — stripped by projectForPlayer)
```

---

## 3. Commands (inputs)

Commands carry `by: PlayerId | 'host'`. The engine rejects a command whose `by` is not the player entitled to act (or is not `'host'` for host-only commands).

| Command | Issued by | Phase / step | Notes |
|---|---|---|---|
| `START_MATCH` | host | lobby | Seeded seat shuffle, round 1, first turn's dice. |
| `ADVANCE` | active player | turn / roll | Moves exactly the sum of the two dice; resolves the destination. |
| `BUY_PROPERTY { tileIndex }` | active player | turn / buy_or_decline | List price to the bank. |
| `DECLINE_PROPERTY { tileIndex }` | active player | turn / buy_or_decline | Opens a decline auction. |
| `UPGRADE_PROPERTY { tileIndex }` | active player | turn / actions | One per turn; Exchange discount if granted this turn. |
| `USE_LEVERAGE_TOKEN { payload }` | active player | turn / actions | `{ kind: 'force_auction', tileIndex }` or `{ kind: 'credit_line' }`. |
| `REROLL_PULSE` | active player | turn / actions | Only after landing on Pulse Relay, once. |
| `END_TURN` | active player | turn / actions | Voluntary end. |
| `TURN_TIMED_OUT` | host | turn (any step) | Step-local default (R11). |
| `SUBMIT_SEALED_BID { amount }` | eligible bidder | auction | Integer, ≥ minimum, ≤ cash, one per player. |
| `CLOSE_AUCTION` | host | auction | Resolves; returns to the opener's action window. |

Commands not listed here are **not** part of v1. Adding one requires a design-doc change first.

---

## 4. Events (outputs)

Events are emitted in causal order. Every event carries `round` and `seq` (monotonic per match).

| Event | Emitted when |
|---|---|
| `MATCH_STARTED` | START_MATCH accepted; carries seat order |
| `TURN_STARTED` | a player's turn opens |
| `DICE_ROLLED` | both dice for the turn |
| `PLAYER_MOVED` | from, to, steps (= dice sum), dice |
| `HUB_BONUS_PAID` | ₵150 on passing/landing tile 0 |
| `PROPERTY_OFFERED` | active player may buy or decline |
| `PROPERTY_PURCHASED` / `PROPERTY_DECLINED` | — |
| `AUCTION_OPENED` | tile, origin, eligible, minimum bid |
| `BID_RECEIVED` | bidder only — **no amount** |
| `AUCTION_RESOLVED` | winner (or null), winning bid, all bids revealed, `tieBroken` (equal bids → furthest from Hub, then seat) |
| `PAYMENT_MADE` | any transfer; `requested`, `paid`, `capped`, `reason` (`yield` / `audit` / `purchase` / `auction` / `upgrade`); `to: null` = bank |
| `DEBT_INCURRED` | capped remainder added to debt |
| `INTEREST_ACCRUED` | 10% at the start of rounds 2–12 |
| `DEBT_REPAID` | 50% of incoming money applied to debt; `source` |
| `PROPERTY_UPGRADED` | level, cost, whether the Exchange discount applied |
| `WINDFALL_RECEIVED` | amount and whether the player was last |
| `EXCHANGE_DISCOUNT_GRANTED` | landed on Exchange |
| `LEVERAGE_TOKEN_GRANTED` | start-of-round grant (rounds 2–12) to tied-last players, cap 3 |
| `LEVERAGE_TOKEN_USED` | payload |
| `CREDIT_LINE_TAKEN` | ₵200 to cash and to the separate credit-line balance; not income |
| `CITY_PULSE_TELEGRAPHED` | start of rounds 3 / 6 / 9 |
| `CITY_PULSE_REROLLED` | Pulse Relay reroll; previous and new effect |
| `CITY_PULSE_APPLIED` | start of rounds 4 / 7 / 10 |
| `TURN_TIMED_OUT` | host expiry accepted; which step |
| `TURN_ENDED` / `ROUND_ENDED` | — |
| `MATCH_ENDED` | after round 12; final Net Worth per player, ranked |

Events are the **only** thing the client animates from. If a state change has no event, that is an engine bug.

---

## 5. Rule violations

`applyCommand` returns `{ ok: false, error }` for:

`NOT_YOUR_TURN`, `WRONG_PHASE`, `UNKNOWN_COMMAND`, `INSUFFICIENT_FUNDS`, `PROPERTY_NOT_AVAILABLE`, `NOT_ELIGIBLE_TO_BID`, `INVALID_BID`, `UPGRADE_NOT_ALLOWED`, `NO_LEVERAGE_TOKENS`, `INVALID_LEVERAGE_TARGET`, `REROLL_NOT_AVAILABLE`, `INVALID_PLAYER_COUNT`, `MATCH_ALREADY_STARTED`, `MATCH_ENDED`.

Violations never mutate state and emit no events.

---

## 6. Determinism contract

1. `applyCommand` is referentially transparent; inputs are deep-copied into a working draft and never mutated.
2. All randomness via `state.rng` — a counter-based splitmix-style hash of `(seed, counter)`, dependency-free. Draws: seat shuffle, two dice per turn, Pulse reroll (two draws). Auction ties consume no RNG.
3. Object key order in state is fixed by construction so `JSON.stringify` is stable enough for `hashState`.
4. Test: run a scripted 12-round match twice from the same seed → identical `hashState` at every step (`packages/engine/test`).

---

## 7. Acceptance tests

Implemented in `packages/engine/test/*.test.ts` (`npm test -w packages/engine`, or `node --test test/*.test.ts` — no install required on Node ≥ 24):

- Initial state, player-count validation, seeded seat order, dice range.
- Movement by exactly the dice sum; Hub bonus once per crossing; timeout at the roll step still moves and resolves; timeout on a pending buy declines; timeout in the action window ends the turn.
- RNG statistics: uniform faces, independent dice, triangular 2–12 sum distribution, seed decorrelation, unbiased rejection sampling, determinism.
- Purchase, decline → auction with everyone eligible, bid validation (min / cash / one per player), highest wins and pays, furthest-from-Hub then seat tie-break with no RNG use, zero-bid outcome, bid redaction in `projectForPlayer`.
- Upgrades: costs, yield increments, max 2, one per turn, ownership, Exchange discount and its consumption.
- Payments: yield, 25% cap and debt remainder, ₵0-cash case, 50% income-to-debt, set bonus, Pulse multipliers and rounding order.
- Audit and Windfall (last-place by Net Worth).
- Debt interest at the start of rounds 2–12 (11 accruals, none after round 12) and rounding; Credit Line interest-free; no elimination.
- Leverage grant at the start of rounds 2–12 to tied-last players (none in round 1, none after round 12, cap 3), Force Auction validity and flow, Credit Line as a non-income balance, exactly two options.
- City Pulse telegraph/apply rounds, persistence, reroll semantics and determinism.
- Net Worth formula; final ranking; interest before scoring.
- Determinism and purity: identical hashes on replay; inputs unchanged; JSON round-trip.
