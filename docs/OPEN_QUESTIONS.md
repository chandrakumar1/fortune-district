# Open Questions — Fortune District v0.1

Rules whose existence is specified in [GAME_DESIGN_v0.1.md](GAME_DESIGN_v0.1.md) but whose details were not yet recorded there. **The engine must not implement a guess for any OPEN item.** Each item is resolved by the design owner; the resolution is written into the design doc and the item is marked closed here.

Priority: **P1** blocks Phase 1 (rules engine core). **P2** blocks Phase 2 (simulator balance work). **P3** can be deferred.

Status legend: **Closed** — resolved by the Paper Playtest Kit (14 Sep 2026) and/or the design owner's locked decisions (14 Sep 2026, including the rules-audit rulings R1/R3/R4/R9 and A1–A7), recorded in GAME_DESIGN. **Closed (R-n)** — closed, but part of the rule rests on a *literal-reading* entry in GAME_DESIGN §12 that the design owner has not explicitly ruled on and may still overrule. **Open** — not resolved.

| ID | Pri | Area | Question | Status |
|---|---|---|---|---|
| Q-01 | P1 | Movement | How does a player advance around the 24-tile loop? | **Closed** — two independent 1–6 dice; the player moves forward exactly their sum (revised 14 Sep 2026 from "choose one") (GD §2.2). |
| Q-02 | P1 | Turns | Round = one turn per player in fixed seat order; how is order determined? | **Closed** — seeded shuffle at match start, fixed for the match (GD §7). |
| Q-03 | P1 | Turns | Permitted actions; timer expiry behaviour. | **Closed** — roll → move the sum → resolve → action window → end (A7); the move still happens on timeout; undecided buy = decline → auction (GD §7). |
| Q-04 | P1 | Board | Identity and behaviour of the non-property tiles. | **Closed (R10, R13)** — Hub ×1, Pulse Relay ×2, Audit, Exchange (replaces the turn's upgrade, A6), Windfall (tied-last counts, A2) (GD §2.1). Jail and Surprise are not Level 1. |
| Q-05 | P1 | Board | Tile ordering; per-category counts; tier placement. | **Closed** — exact kit layout (GD §2). |
| Q-06 | P1 | Economy | District Hub +₵150 trigger. | **Closed** — pass or land, once per crossing (GD §2.1). |
| Q-07 | P1 | Properties | Tier names, prices, base payments. | **Closed** — T1/T2/T3 ₵100/15 · ₵180/30 · ₵260/50 (GD §4.2). |
| Q-08 | P1 | Properties | Upgrade cost, max level, effect, prerequisites. | **Closed (R8)** — ₵50/+9 · ₵90/+18 · ₵130/+30, max 2, one per turn, no prerequisite (GD §4.3). |
| Q-09 | P1 | Properties | Set bonus ×2 condition and target. | **Closed** — all three of a category; (base + upgrades) × 2 × Pulse, floor (GD §4.4). |
| Q-10 | P1 | Payments | 25% cap base, scope, remainder. | **Closed** — 25% of payer cash on yield payments; remainder → debt (GD §5.1). |
| Q-11 | P1 | Debt | Incurrence, interest timing, repayment, ceiling. | **Closed** — capped remainder; 10% at the start of rounds 2–12, none after round 12 (R4 locked); repaid only by the 50%-of-income rule; no ceiling (GD §3, §5.2). |
| Q-12 | P1 | Leverage | What tokens are, count, gain, effects, Net Worth. | **Closed** — start of rounds 2–12, after interest, every tied-last player by Net Worth gets 1, cap 3 (R3 locked); Force Auction on one unowned property (A5) or Credit Line ₵200 as a separate non-income balance (R9 locked); Shield removed; ₵0 value (GD §5.3). |
| Q-13 | P1 | Auctions | Trigger, eligibility, min bid, tie-break, zero-bid, bid ceiling. | **Closed** — decline (incl. timeout); everyone incl. decliner; min half price; max = cash; tie → furthest from Hub (forward distance), then seat order (R1 locked); no bids → unowned (GD §4.5). |
| Q-14 | P1 | City Pulse | Effect catalogue, selection, telegraph, scope. | **Closed** — ×1.5 / ×0.6 by category; fixed schedule, rerollable via Pulse Relay; announced one round ahead; active R4–6, R7–9, R10–12 (A4) (GD §6). |
| Q-15 | P1 | Scoring | Net Worth formula. | **Closed** — cash + prices paid + upgrades paid − debt (incl. Credit Line) (GD §8). |
| Q-16 | P2 | Scoring | Tie-break for equal Net Worth after round 12. | **Open.** Engine reports ties in seat order (R12) pending a rule. |
| Q-17 | P1 | Players | Elimination / bankruptcy in v1? | **Closed** — none (GD §5.4). |
| Q-18 | P1 | Scope | Transcribe the exact v1 exclusions list into GAME_DESIGN §9.1. | **Open** — only "Jail and Surprise are not Level 1" is recorded. Does not block the engine. |
| Q-19 | P3 | Scope | Definitions of v1.1 Exchange window and v2 deal-making. | Open (out of scope). |
| Q-20 | P2 | Match | Any early-end conditions before round 12? | **Closed** — "No early ending. The match ends after Round 12. Every player receives exactly 12 turns." (GD §8). |
| Q-21 | P2 | Economy | Confirm ₵ is integer-only. | **Closed** — integers; round down at the end of every calculation (global convention). |
| Q-22 | P3 | Server | Disconnect / AFK handling. | Open (server concern). |

## Engine readings

R1–R13 are listed in [GAME_DESIGN_v0.1.md §12](GAME_DESIGN_v0.1.md) and mirrored in `packages/engine/src/rulings.ts`. R1, R3, R4, R9 and the A1–A7 rulings were locked by the design owner in the 14 Sep 2026 rules audit. R8, R10, R12 and R13 remain literal readings of the kit that the design owner can overrule with a one-line change plus the corresponding test update. They are not new questions.

## Assumptions adopted provisionally in Phase 0

| Assumption | Used by | Outcome |
|---|---|---|
| ₵ amounts are non-negative integers; debt is a separate non-negative integer | `types.ts` | Confirmed (Q-21) |
| A round is one turn per active player in fixed seat order | `types.ts` | Confirmed (Q-02) |
| Players remain in the match through round 12 (no elimination modelled) | `types.ts` | Confirmed (Q-17) |
| Decline auction is triggered by declining an unowned property | `types.ts` | Confirmed (Q-13); Leverage Force Auction added as a second trigger |
| Net Worth is computed by the engine, not the client | Architecture | Confirmed (Q-15) |
