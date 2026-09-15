# FORTUNE DISTRICT — Game Design v0.1

**Status:** Source of truth for v1 implementation.
**Supersedes:** All earlier Fortune District drafts (including the prior Monopoly-like design). Nothing from those drafts is carried forward unless it appears in this document.

This file records the v0.1 specification as provided by the design owner, the rules transcribed from the [Paper Playtest Kit](PAPER_PLAYTEST_KIT_v0.1.md) (14 Sep 2026), and the decisions locked by the design owner on 14 Sep 2026 (initial lock, and the rules-audit corrections R1/R3/R4/R9, A1–A7, Q-20 later the same day). Where a rule remains unspecified it is marked **OPEN (Q-nn)** and tracked in [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md). Points the kit leaves unstated but the engine cannot leave undefined are recorded in §12 as **engine readings (R1–R13)**; those marked *locked* are design-owner rulings, the rest are literal readings of the kit and remain overridable.

---

## 1. Design Pillars

| Pillar | Specification |
|---|---|
| Match length | **15 minutes** target per match |
| Players | **2–4** |
| Structure | **12 rounds**, fixed — the match does not run "until bankruptcy" |
| Pace | **20-second turn timer** (official). The Paper Playtest Kit uses **30 s per decision** for human playtests; the hot-seat prototype defaults to 30 s, configurable. |
| Win condition | **Highest Net Worth after round 12** |
| Elimination | **None.** "Nobody gets knocked out." Debt "just counts against you at the end." |
| Originality | Fortune District is an original design. It must **not** copy Monopoly / RichUp-style structures (see §10). |

Time budget sanity check (informational, not a rule): 12 rounds × 4 players × 20 s = 16 min of maximum turn time, before auction windows. The 15-minute target therefore assumes average turns run well under the cap. The simulator (Phase 2) measures this.

---

## 2. Board

24 tiles in a circular loop. **18 properties + 6 specials.** Specials sit at 0, 4, 8, 12, 16, 20 — every special is separated by three property tiles. The layout is fixed (no procedural generation). Jail and Surprise tiles are **not** part of Level 1.

| # | Tile | Type | Cat | Tier | Price / Yield |
|---|---|---|---|---|---|
| 0 | **District Hub** | Special | — | — | +₵150 pass/land |
| 1 | Kestrel Row | Property | RES | 1 | ₵100 / ₵15 |
| 2 | Quanta Campus | Property | TEC | 2 | ₵180 / ₵30 |
| 3 | Neon Arcade | Property | LEI | 1 | ₵100 / ₵15 |
| 4 | **Pulse Relay** | Special | — | — | reroll next Pulse |
| 5 | Foundry Yard | Property | IND | 1 | ₵100 / ₵15 |
| 6 | Helix Reactor | Property | ENE | 3 | ₵260 / ₵50 |
| 7 | Tram Depot | Property | TRA | 1 | ₵100 / ₵15 |
| 8 | **Audit** | Special | — | — | pay 8% of cash |
| 9 | Vireo Terraces | Property | RES | 2 | ₵180 / ₵30 |
| 10 | Lattice Labs | Property | TEC | 1 | ₵100 / ₵15 |
| 11 | Aurora Colosseum | Property | LEI | 3 | ₵260 / ₵50 |
| 12 | **Pulse Relay** | Special | — | — | reroll next Pulse |
| 13 | Ironworks Mile | Property | IND | 2 | ₵180 / ₵30 |
| 14 | Solar Flats | Property | ENE | 1 | ₵100 / ₵15 |
| 15 | Skyrail Junction | Property | TRA | 2 | ₵180 / ₵30 |
| 16 | **Exchange** | Special | — | — | one upgrade anywhere, 20% off |
| 17 | Halcyon Heights | Property | RES | 3 | ₵260 / ₵50 |
| 18 | Cortex Tower | Property | TEC | 3 | ₵260 / ₵50 |
| 19 | Skyline Gardens | Property | LEI | 2 | ₵180 / ₵30 |
| 20 | **Windfall** | Special | — | — | +₵100, or +₵250 if last |
| 21 | Titan Docks | Property | IND | 3 | ₵260 / ₵50 |
| 22 | Fusion Spur | Property | ENE | 2 | ₵180 / ₵30 |
| 23 | Orbital Gate | Property | TRA | 3 | ₵260 / ₵50 |

Each category's three tiles sit roughly 8 apart. Category codes: RES Residential, TEC Tech, LEI Leisure, IND Industry, ENE Energy, TRA Transit.

### 2.1 Special tiles

- **District Hub (0):** "Every time you pass or land on the Hub, you get ₵150." One payout per crossing.
- **Pulse Relay (4, 12):** Landing lets the player **reroll the next upcoming City Pulse**, even if it has already been announced (locked rule 4). The reroll uses the seeded RNG to pick one boosted category and one *different* suppressed category from the six; it replaces the previously scheduled Pulse. A Pulse that is already active is never affected. If no Pulse remains ahead (rounds 10–12) the tile has no effect. The reroll is optional (R10).
- **Audit (8):** "pay 8% of cash", rounded down, to the bank (R13).
- **Exchange (16):** "one upgrade anywhere, 20% off" — this turn's one upgrade may be bought at 80% of cost. It **replaces** the normal one-upgrade-per-turn action; it does not grant an extra upgrade (A6). Distinct from the v1.1 *Exchange window* (§9.2).
- **Windfall (20):** "+₵100, or +₵250 if last" — last place by Net Worth, evaluated before the payout; tied-lowest players count as last (R2).

### 2.2 Movement (Q-01 — locked; revised 14 Sep 2026)

Two independent 1–6 dice are rolled from the seeded RNG at turn start; the player **must move forward (clockwise) exactly the sum of the two dice** (2–12). There is no choice of die. *(Supersedes the earlier "roll two dice, choose one" rule; nothing else about movement, the board or the economy changed.)*

---

## 3. Economy

| Parameter | Value |
|---|---|
| Currency | Fortune Credits, symbol **₵** |
| Starting cash | **₵1,200** per player |
| District Hub bonus | **+₵150** per pass or landing |
| Currency granularity | **Integer ₵. Round down at the end of every calculation.** (Global convention, 14 Sep 2026.) |

**Incoming money (locked rule 2):** whenever a player receives income (Hub bonus, Windfall, yields received), **50% of it (rounded down) is applied automatically to ordinary debt**, up to the outstanding amount; the remainder becomes cash. The Leverage Credit Line is **not** income and is never subject to this rule (§5.3). A player in debt never loses agency: they may still buy, upgrade, bid and use Leverage.

---

## 4. Properties

### 4.1 Categories

Six categories: **Residential, Tech, Leisure, Industry, Energy, Transit** — three properties each, one of each tier (see §2).

### 4.2 Tiers (Q-07 — resolved)

| Tier | Price | Yield |
|---|---|---|
| T1 | ₵100 | ₵15 |
| T2 | ₵180 | ₵30 |
| T3 | ₵260 | ₵50 |

**Yield** is the amount a player pays the owner when landing on the owner's property.

### 4.3 Upgrades (Q-08 — resolved)

"Upgrade costs: T1 ₵50 (+₵9 yield) · T2 ₵90 (+₵18) · T3 ₵130 (+₵30). Max 2 per property." "You can buy one upgrade per turn on anything you own." No set prerequisite. Both levels cost the same and add the same yield (R8). Upgrades are bought in the post-move action window.

### 4.4 Category Set Bonus (Q-09 — resolved)

"Own all three properties of a category and your income from them doubles." Locked rule 6 — the yield paid on a property is:

```
floor( (base yield + upgrade yield) × set bonus (×2 if owner holds all three) × City Pulse modifier )
```

rounded down once at the end. The set bonus does not affect Net Worth valuation.

### 4.5 Acquiring Property — Buy or Decline Auction (Q-13 — locked)

Landing on an unowned property, the player may buy it at list price. "If you say no, it goes to auction — everyone bids at once, minimum half price, highest bid wins."

- **10-second sealed-bid window**, separate from the turn timer. No bidder sees another's bid before resolution; all bids are revealed at resolution.
- **Eligible bidders:** everyone, **including the player who declined**. A player in debt participates normally.
- **Minimum bid:** half the list price (₵50 / ₵90 / ₵130).
- **Maximum bid:** the bidder's current cash. A bid may not exceed cash.
- **Winner** pays their bid to the bank; that amount is the property's "price paid" for Net Worth.
- **Tie-break (locked, R1):** "Highest bid wins; ties to player furthest from Hub." *Furthest* = greatest forward distance to the Hub on the one-way loop (a bidder on tile 1 has 23 to travel; on tile 23, 1). If tied bidders occupy the same tile, the lower seat wins. No randomness is used.
- **Nobody bids:** the property remains unowned.
- Declining by timeout (§7) triggers the auction exactly like an explicit decline.

---

## 5. Payments, Cap, Debt, Leverage

### 5.1 Payment Cap — 25% (Q-10 — resolved)

"No single payment can take more than a quarter of your cash. Anything above that becomes debt." Applies to yield payments between players. Paid = min(yield, floor(cash ÷ 4)); the remainder is added to the payer's ordinary debt. With ₵0 cash the payer pays ₵0 and the full yield becomes debt. Payments to the bank (purchases, upgrades, auction bids, Audit) are not capped — they are limited by cash.

### 5.2 Debt — 10% Interest (Q-11 — resolved)

- Incurred automatically as the uncapped remainder of a yield payment.
- **"Debt accrues 10% interest at the start of each round."** (locked, R4) floor(debt ÷ 10) is added at the start of rounds 2–12, before the Leverage last-place calculation. **No interest is charged after round 12**; final scoring uses the debt as it stood during round 12.
- Repaid only through the incoming-money rule (§3). There is no separate repayment action.
- No ceiling. Debt never eliminates a player; it counts against Net Worth.

### 5.3 Leverage Tokens (Q-12 — locked)

**"At the start of each round, the player currently last by net worth receives 1 Leverage token."** (locked, R3)

- **No grant in round 1.** Players start with 0 tokens.
- At the start of rounds 2–12, in this order: (1) ordinary debt interest (§5.2); (2) the player(s) with the lowest Net Worth from the completed previous round are identified; (3) **every tied-last player** receives 1 token (A2).
- A player holds at most **3** tokens; a grant that would exceed the cap is not made.
- No grant after round 12.

Spend one token, in the post-move action window, for **one of two options** (Shield is removed from v0.1; no third option):

1. **Force Auction** — put **one currently unowned property** to a sealed auction; the normal §4.5 rules apply immediately and the user may bid (A5).
2. **Credit Line** — "take ₵200 interest-free." (locked, R9) A **separate ₵200 interest-free balance**: the ₵200 is added to cash directly. It is **not** income — the 50% ordinary-debt rule (§3) does not apply to it, and ordinary income never repays it. It never accrues interest. It is deducted from Net Worth and thereby settled at final scoring.

Tokens have no ₵ value in Net Worth.

### 5.4 Elimination (Q-17 — resolved)

None. Players remain in the match through round 12 regardless of debt.

---

## 6. City Pulse (Q-14 — resolved, with R5)

"The city economy shifts at rounds 4, 7 and 10 — one category earns 50% more, another earns 40% less. You always see the next shift one round before it happens."

- **Effect:** yields of the boosted category ×1.5, of the suppressed category ×0.6 (applied inside the §4.4 formula).
- **Schedule (fixed for the test games):**

| Active from | Boosted ×1.5 | Suppressed ×0.6 |
|---|---|---|
| Round 4 | Tech | Industry |
| Round 7 | Leisure | Energy |
| Round 10 | Transit | Tech |

- **Telegraph:** announced at the start of the preceding round (3, 6, 9).
- **Duration (A4):** each shift remains active until the next Pulse replaces it — rounds 4–6, 7–9, 10–12.
- **Reroll:** via Pulse Relay (§2.1). A rerolled Pulse replaces the scheduled one and is re-announced if it had already been telegraphed.

---

## 7. Turn Structure (Q-02, Q-03 — locked)

- **Seat order:** fixed for the match, determined by a seeded shuffle at match start. A round is one turn per player in seat order.
- **Turn (A7):** roll two dice → move exactly their sum → resolve landing (Hub bonus if passed; buy/decline; yield; special tile) → **action window** (one upgrade, Leverage, Pulse Relay reroll) → end turn. No upgrades or Leverage actions before movement.
- **Start of rounds 2–12** (before the first turn): interest (§5.2) → Leverage grant (§5.3) → City Pulse announce/apply (§6).
- **Timer:** 20 s official (30 s in the paper kit / prototype). **On timeout** the engine applies the step's default: if the player has not yet moved, the move still happens — exactly the dice sum — and the destination resolves normally; an undecided buy counts as **decline** and triggers the auction; in the action window the turn ends. In an auction, not bidding is "no bid".

---

## 8. Match End & Scoring (Q-15 — resolved)

- **No early ending. The match ends after round 12. Every player receives exactly 12 turns.** (Q-20 — closed) Nothing happens between the last turn of round 12 and scoring: no interest, no Leverage grant.
- **Net worth = cash + prices paid + upgrades paid − debt** (ordinary debt and Credit Line). "Prices paid" is what the current owner actually paid (list price or winning bid); "upgrades paid" is the ₵ actually spent (Exchange discount included). Leverage tokens have no value.
- Winner: highest Net Worth. Equal Net Worth: ranking keeps seat order (R12); a formal tie-break is **OPEN (Q-16)**.
- Early-end conditions: none (Q-20 closed, above).

---

## 9. Scope Boundaries

### 9.1 v1 Exclusions

Jail and Surprise tiles are excluded from Level 1. The fuller exclusions list from the original v0.1 document is still to be transcribed — **OPEN (Q-18)**. Until then, the engine implements **only** what is listed in §1–§8 and §12.

### 9.2 v1.1 — Exchange Window

A future **Exchange window** feature is planned for **v1.1**. It is **out of scope for v1** and unrelated to the Exchange *tile* in §2.1. The architecture must not preclude it (see [ARCHITECTURE.md §7](ARCHITECTURE.md)). Definition: **OPEN (Q-19)**.

### 9.3 v2 — Deal-Making Expansion

A **deal-making expansion** is planned for **v2**. It is **out of scope for v1 and v1.1**. Definition: **OPEN (Q-19)**.

---

## 10. Originality Requirements

Fortune District must be an original game. Specifically:

- Do **not** copy Monopoly or RichUp-style structures, naming, board conventions, or rule bundles.
- The fixed 12-round / 15-minute structure, payment cap, debt-with-interest, leverage tokens, decline auctions with sealed bidding, telegraphed City Pulse, and Net Worth victory are the distinguishing systems. Implementation and presentation must reinforce these, not smooth them back toward the familiar template.
- Where an OPEN item is resolved, the resolution must respect this requirement. Defaulting an unspecified rule to "what Monopoly does" is not an acceptable resolution.

---

## 11. Parameter Summary (machine-mirrored)

These values are mirrored in `packages/engine/src/constants.ts`. The two must stay in sync; the constants file cites this section.

| Constant | Value |
|---|---|
| Match target length | 15 min |
| Players | 2–4 |
| Board tiles | 24 (18 properties + 6 specials at 0, 4, 8, 12, 16, 20) |
| Rounds | 12 |
| Turn timer | 20 s official; 30 s playtest/prototype default |
| Auction sealed-bid window | 10 s |
| Starting cash | ₵1,200 |
| District Hub bonus | ₵150 per pass or landing |
| Dice | two independent d6; move exactly the sum (2–12) |
| Categories | Residential, Tech, Leisure, Industry, Energy, Transit |
| Tier price / yield | T1 ₵100/₵15 · T2 ₵180/₵30 · T3 ₵260/₵50 |
| Upgrade cost / +yield | T1 ₵50/+₵9 · T2 ₵90/+₵18 · T3 ₵130/+₵30; max 2; one per turn |
| Category set bonus | ×2 on yield |
| Payment cap | 25% of payer cash; remainder → debt |
| Debt interest | 10% at the start of rounds 2–12; none after round 12 |
| Incoming money to debt | 50% (Hub, Windfall, yields; not Credit Line) |
| Leverage grant | start of rounds 2–12, tied-last by Net Worth, cap 3 |
| Auction minimum bid | 50% of list price; max = cash; ties → furthest from Hub, then seat |
| Audit | 8% of cash |
| Exchange | upgrade at 80% cost |
| Windfall | ₵100 / ₵250 if last |
| Credit Line | ₵200 interest-free |
| City Pulse rounds | 4, 7, 10; ×1.5 / ×0.6; announced one round ahead |
| Rounding | integers; round down at the end of every calculation |

---

## 12. Engine readings (R1–R13) and audit rulings (A1–A7)

Points the kit does not state but the engine cannot leave undefined. Mirrored in `packages/engine/src/rulings.ts`. Rows marked **locked** were ruled by the design owner in the 14 Sep 2026 rules audit and are authoritative; the others are the most literal reading of the kit and remain overridable — after which this table, `rulings.ts` and the tests change together.

| # | Gap | Rule implemented | Status |
|---|---|---|---|
| R1 | Auction tie-break | Furthest from the Hub = greatest forward distance on the one-way loop; same tile → lower seat. No RNG. | **Locked** (A1) |
| R2 | "Last place" (Windfall, Leverage grant) | Lowest Net Worth; all players tied for lowest count as last. | **Locked** (A2) |
| R3 | Leverage grant timing / count | 0 at start; no grant in round 1; at the start of rounds 2–12, after interest, every tied-last player gets 1, capped at 3; none after round 12. | **Locked** (A3) |
| R4 | Interest timing | floor(debt ÷ 10) at the start of rounds 2–12, before the Leverage calculation; none after round 12. | **Locked** |
| R5 | Pulse duration | Active until the next Pulse replaces it: rounds 4–6, 7–9, 10–12. | **Locked** (A4) |
| R6 | Force Auction target | One currently unowned property; normal auction rules apply immediately; the user may bid. | **Locked** (A5) |
| R7 | Exchange | The discounted upgrade replaces this turn's one upgrade; no extra upgrade; lapses at turn end. | **Locked** (A6) |
| R8 | Second upgrade level | Same cost and yield increment as the first. | Literal reading |
| R9 | Credit Line | Separate ₵200 interest-free balance added to cash; not income (no 50% rule); deducted from Net Worth and settled at final scoring. | **Locked** |
| R10 | Pulse Relay | Reroll is optional, once per landing, during that turn's action window; no effect after the last Pulse. | Literal reading of locked rule 4 |
| R11 | Turn structure / timeouts | Roll two dice → move exactly their sum → resolve landing → action window → end; nothing before movement. Timeout is step-local (the move still happens / decline / end turn; no bid in an auction). | **Locked** (A7) |
| R12 | Equal Net Worth in the final ranking | Seat order (reporting only; tie-break rule remains Q-16). | Literal reading |
| R13 | Audit recipient | Bank. | Literal reading |
