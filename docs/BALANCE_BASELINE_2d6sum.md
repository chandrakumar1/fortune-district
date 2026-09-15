# Balance Baseline — v0.1 rules with 2d6-sum movement

**Date:** 14 Sep 2026 · **Rules:** [GAME_DESIGN_v0.1.md](GAME_DESIGN_v0.1.md) as of the movement revision (roll two dice, move exactly the sum), all locked decisions and R1–R13 · **Engine tests:** 66/66 · **Determinism:** 100 seeds × 2 runs + replay agree.

Purpose: a reference point *before* any balance change. Re-run the same commands after a change and compare. No rule or economy value was altered to produce these numbers.

Bots are deliberately crude (see [packages/simulator/README.md](../packages/simulator/README.md)); they exercise the rules, they do not play well. Treat every figure as "what the rules do under simple policies", not as a human prediction. "Simulated length" uses bot latencies (1–5 s per decision, timeouts at 20 s), so it is a *lower bound* on human match length, not an estimate of it.

Reproduce:

```sh
node packages/simulator/src/cli.ts run --matches 10000 --players 4 --bots greedy,random,random,passive --seed 42
node packages/simulator/src/cli.ts run --matches 10000 --players 4 --bots random,random,random,random --seed 42
node packages/simulator/src/cli.ts run --matches 10000 --players 4 --bots greedy,greedy,greedy,greedy --seed 42
node packages/simulator/src/cli.ts run --matches 10000 --players 3 --bots greedy,random,passive --seed 42
node packages/simulator/src/cli.ts run --matches 10000 --players 2 --bots greedy,random --seed 42
```

## 1. Primary batch — 10,000 × 4 players, greedy / random / random / passive, seed 42

| Metric | Value |
|---|---|
| Simulated match length | 8.9 min (p10 8.3 · p50 8.9 · p90 9.6) |
| Commands / match | 175.7 |
| Mean move / laps per player | 7.00 tiles · 3.50 laps |
| Hub bonuses per player | 3.02 (≈ ₵450) |
| Auctions / match | 15.7 (zero-bid 22.8 %) |
| Auction price / list | 1.67 (random bot overbids) |
| Yield payments / match | 17.0 — capped 41.8 %, ₵278 withheld by the cap |
| Players ever in debt | 66.3 % |
| Peak debt / player | ₵53 |
| Interest paid / match | ₵41 |
| Leverage granted / used | 9.86 / 7.15 (force auction 86 %, credit line 14 %) |
| Pulse rerolls / match | 1.16 |
| Complete sets / match | 0.48 (any set in 39.7 % of matches) |
| Properties owned at end | 16.2 of 18 |
| Net Worth spread (max − min) | ₵529 |
| Leader changed after round 6 | 43.3 % |
| Win rate by seat | 28.8 / 26.0 / 24.0 / 21.1 % |

By bot kind (seats are shuffled per seed, so this is policy, not position):

| Bot | Win rate | Mean final Net Worth |
|---|---|---|
| greedy | 56.6 % | ₵1,794 |
| random | 20.6 % / 19.9 % | ₵1,621 / ₵1,623 |
| passive | 2.8 % | ₵1,416 |

## 2. Symmetric batches — 10,000 × 4 players, identical bots (seat effect isolated)

| Metric | all-random | all-greedy |
|---|---|---|
| Simulated match length | 9.4 min | 12.2 min |
| Auctions / match (zero-bid) | 19.3 (29.6 %) | 8.2 (0 %) |
| Auction price / list | 2.29 | 0.85 |
| Yield payments (capped) | 17.4 (66.5 %) | 20.1 (34.3 %) |
| Players ever in debt | 96.3 % | 76.3 % |
| Peak debt / player | ₵79 | ₵65 |
| Leverage granted / used | 12.6 / 12.0 | 11.7 / 8.0 |
| Complete sets / match | 0.23 (20.6 %) | 0.32 (27.2 %) |
| Properties owned at end | 16.8 | 18.0 |
| Net Worth spread | ₵370 | ₵504 |
| Leader changed after R6 | 46.8 % | 45.6 % |
| **Win rate by seat** | **29.6 / 26.1 / 23.1 / 21.3 %** | **31.4 / 26.1 / 22.5 / 20.0 %** |

## 3. Player-count variants — 10,000 each

| Metric | 2p greedy/random | 3p greedy/random/passive | 4p (primary) |
|---|---|---|---|
| Simulated match length | 6.6 min | 7.2 min | 8.9 min |
| Yield payments / match | 4.6 | 9.3 | 17.0 |
| Players ever in debt | 72.9 % | 47.4 % | 66.3 % |
| Complete sets / match | 0.59 (47.1 %) | 0.65 (51.0 %) | 0.48 (39.7 %) |
| Properties owned at end | 13.7 | 13.6 | 16.2 |
| Net Worth spread | ₵210 | ₵450 | ₵529 |
| Leader changed after R6 | 29.3 % | 36.7 % | 43.3 % |
| Win rate by seat | 53.1 / 46.9 % | 35.5 / 32.6 / 31.9 % | 28.8 / 26.0 / 24.0 / 21.1 % |

## 4. Observations (data only — no rule changes proposed here)

1. **Seat order matters.** In both symmetric 4-player batches seat 1 wins ~30 % and seat 4 ~20–21 % — a ~1.5× first-seat advantage that survives 10,000 matches with identical policies. It is present at 3p (35.5 vs 31.9 %) and 2p (53.1 vs 46.9 %).
2. **The kit's "sets never complete" worry:** with sum movement (3.5 laps per player) a full set appears in 20–51 % of matches depending on player count and policy; 4-player mixed play averages 0.48 sets per match. Not "never", not common.
3. **The cap and debt are active systems, not dead ones:** 34–67 % of yield payments hit the 25 % cap and two-thirds or more of players carry debt at some point — but peak debt is small (₵50–80) and interest per match is ₵16–64, so debt is frequent and shallow.
4. **Leverage is used heavily** (7–12 tokens spent per match), overwhelmingly as Force Auction; Credit Line is rare except for random bots.
5. **Late-game movement:** the round-6 leader loses in 43–47 % of 4-player matches. There is no direct "rounds 11–12 felt dead" metric yet; this is the closest proxy.
6. **Rent dodging** (the kit's first failure mode) is structurally gone — movement is no longer a choice.
7. **Auctions:** zero-bid auctions range from 0 % (all-greedy) to 42 % (2p). The random bot's overbidding (price/list up to 2.3) inflates auction revenue in mixed batches; do not read price/list as a human signal.

## 5. Endgame instrumentation — round-by-round (added 14 Sep 2026)

The simulator now records the engine's Net Worth for every player at the end of every round (`MatchRecord.netWorthByRound`, round 0 = before play) and tallies activity per round from the event log (`computeEndgameMetrics`, printed by `fd-sim run`). Same primary batch as §1: 10,000 × 4p, greedy / random / random / passive, seed 42. Nothing in the rules, engine or bots changed.

### 5.1 Activity and stakes by round (per match)

| Round | Buys | Auctions | Upgrades | Leverage | Yield pays | ₵ yield | Capped | ₵ new debt | Hub | \|ΔNW\| / player | Spread | Lead margin | Leader → wins |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1.23 | 1.30 | 1.25 | 0.00 | 0.40 | 14 | 0.01 | 0 | 0.00 | ₵19 | ₵61 | ₵14 | 31.8 % |
| 2 | 0.99 | 2.78 | 1.77 | 1.42 | 0.50 | 16 | 0.09 | 3 | 0.00 | ₵15 | ₵98 | ₵38 | 37.6 % |
| 3 | 0.68 | 2.37 | 1.71 | 1.06 | 0.74 | 22 | 0.22 | 8 | 1.10 | ₵65 | ₵206 | ₵87 | 40.7 % |
| 4 | 0.44 | 1.61 | 1.75 | 0.78 | 1.29 | 40 | 0.34 | 12 | 2.17 | ₵93 | ₵220 | ₵81 | 47.6 % |
| 5 | 0.23 | 1.43 | 1.38 | 0.65 | 1.43 | 41 | 0.59 | 22 | 0.69 | ₵47 | ₵225 | ₵92 | 53.3 % |
| 6 | 0.13 | 1.35 | 1.23 | 0.54 | 1.51 | 41 | 0.75 | 29 | 0.74 | ₵55 | ₵286 | ₵114 | 56.6 % |
| 7 | 0.11 | 1.10 | 1.46 | 0.52 | 1.68 | 48 | 0.69 | 25 | 1.66 | ₵82 | ₵334 | ₵123 | 61.1 % |
| 8 | 0.07 | 0.94 | 1.38 | 0.51 | 1.83 | 54 | 0.81 | 31 | 1.24 | ₵68 | ₵351 | ₵132 | 68.3 % |
| 9 | 0.04 | 0.88 | 1.23 | 0.45 | 1.82 | 53 | 0.90 | 36 | 0.82 | ₵60 | ₵394 | ₵149 | 72.8 % |
| 10 | 0.04 | 0.78 | 1.34 | 0.42 | 1.86 | 56 | 0.87 | 36 | 1.26 | ₵74 | ₵450 | ₵169 | 74.7 % |
| **11** | 0.03 | 0.63 | 1.41 | 0.42 | 1.96 | 62 | 0.89 | 36 | 1.36 | ₵76 | ₵488 | ₵182 | 81.5 % |
| **12** | 0.03 | 0.56 | 1.32 | 0.38 | 1.98 | 64 | 0.94 | 40 | 1.03 | ₵68 | ₵529 | ₵200 | 100 % |

"Leader → wins" = fraction of matches where the leader at the end of that round is the final winner. \|ΔNW\| = mean absolute change in a player's Net Worth during the round. Spread = max − min Net Worth at round end; lead margin = leader minus runner-up.

R11–12 pace vs the R1–10 mean: buys ×0.08 · auctions ×0.41 · upgrades ×0.94 · Leverage ×0.63 · ₵ yield ×1.63 · \|ΔNW\| ×1.24.

### 5.2 Leader stability and catch-up

| | Primary (mixed bots) | Control: all-random |
|---|---|---|
| Leader changed 6→7 / 8→9 / 10→11 / 11→12 | 29.9 / 23.2 / 21.5 / 18.5 % | 33.1 / 26.8 / 26.7 / 24.4 % |
| Winner's rank at end of R6 (#1 / #2 / #3 / #4) | 56.6 / 24.6 / 12.6 / 6.2 % | 53.1 / 23.8 / 13.6 / 9.4 % |
| Winner's rank at end of R8 | 68.3 / 20.8 / 7.6 / 3.4 % | 62.2 / 21.4 / 10.2 / 6.2 % |
| Winner's rank at end of R10 | 74.7 / 18.9 / 4.9 / 1.5 % | 68.2 / 21.8 / 7.1 / 2.9 % |
| Any ranking position changed after R10 | 60.2 % | 69.6 % |
| Last place at R10 escaped last | 26.9 % | 33.4 % |

### 5.3 Reading the two hypotheses (data only)

**"Dead rounds 11–12."** Not supported as stated. Purchasing is over by round 8 (0.03–0.07 buys per match per round, the board is full), and auctions fall to ~40 % of their earlier pace — so the *acquisition* game is dead. But the *money* game is at its peak: rounds 11–12 carry the largest yield flows (₵62–64 per match per round vs a ₵14–56 ramp), the most capped payments, the highest new debt, and Net Worth moves ~24 % more per player than the R1–10 average. Something changes in the ranking after round 10 in 60 % of matches. The last two rounds are the highest-stakes rounds by ₵, just not by decisions.

**"Leader catch-up."** The leader consolidates steadily: the round-6 leader wins 57 % of the time, round-8 68 %, round-10 75 %, round-11 81 %. One match in four is still won by someone who was *not* leading after round 10 (19 % by the runner-up, 6 % from 3rd/4th). Under identical policies (all-random control) the numbers are ~5–7 points looser at every round, so part of the primary's leader stability is the greedy bot being simply better, not the rules. The last-place player at R10 climbs out of last in 27–33 % of matches.

**Where the outcome is decided.** Between rounds 2 and 5 the leader changes 30–50 % of the time; from round 7 on it drops through the 20s. The lead margin roughly doubles from R6 (₵114) to R12 (₵200) while per-round swings stay flat (₵55–₵82) — the endgame has enough movement to overturn a second place but rarely a two-place deficit.

Caveats as in §0: bots are crude, and the greedy bot's dominance (57 % win rate) inflates leader stability in the mixed batch; the all-random control is the fairer read of what the *rules* do.

## 6. Seat analysis — 10,000 × 4p, all-random (added 14 Sep 2026)

`node packages/simulator/src/cli.ts seats --matches 10000 --players 4 --bots random,random,random,random --seed 42`. Identical policies, so every difference below is turn order.

| metric | seat 1 | seat 2 | seat 3 | seat 4 |
|---|---|---|---|---|
| win rate | 29.6 % | 26.1 % | 23.1 % | 21.3 % |
| mean final Net Worth | ₵1,607 | ₵1,590 | ₵1,576 | ₵1,562 |
| mean NW end R2 / R4 / R6 | 1,199 / 1,337 / 1,380 | 1,193 / 1,327 / 1,369 | 1,188 / 1,318 / 1,359 | 1,182 / 1,309 / 1,350 |
| mean NW end R8 / R10 / R12 | 1,477 / 1,537 / 1,607 | 1,465 / 1,524 / 1,590 | 1,453 / 1,513 / 1,576 | 1,442 / 1,497 / 1,562 |
| Hub bonuses / match | 3.02 | 3.02 | 3.02 | 3.02 |
| properties owned at end | 4.37 | 4.23 | 4.14 | 4.11 |
| — bought at list / won at auction | 1.05 / 3.32 | 0.87 / 3.36 | 0.73 / 3.41 | 0.60 / 3.51 |
| landings on unowned / other's property | 3.72 / 3.93 | 3.40 / 4.24 | 3.14 / 4.51 | 2.88 / 4.76 |
| upgrades / ₵ spent | 4.04 / ₵319 | 3.95 / ₵311 | 3.90 / ₵309 | 3.81 / ₵301 |
| yield ₵ received / paid | 92 / 70 | 82 / 78 | 78 / 85 | 71 / 89 |
| capped payments / match | 2.68 | 2.80 | 2.97 | 3.14 |
| ever in debt · debt incurred · peak · interest | 95.0 % · ₵98 · ₵73 · ₵14 | 96.1 % · ₵102 · ₵76 · ₵15 | 96.8 % · ₵109 · ₵80 · ₵17 | 97.4 % · ₵116 · ₵85 · ₵19 |
| Leverage received / used (credit lines) | 2.56 / 2.44 (0.49) | 2.95 / 2.81 (0.60) | 3.33 / 3.18 (0.68) | 3.76 / 3.58 (0.79) |
| Windfall as last place | 0.11 | 0.13 | 0.16 | 0.19 |

Reading (data only): the gap is monotone in seat and present by the end of round 2 (₵17 between seats 1 and 4), before Pulses, sets or meaningful yields. Hub income is identical. The driver is landing order: seat 1 lands on unowned property 3.72 times vs 2.88 for seat 4, and on someone else's property 3.93 vs 4.76 times. Seat 4 therefore buys less at list, pays more yield (₵89 vs ₵70), receives less (₵71 vs ₵92), hits the cap more often and carries more debt and interest. Leverage flows the other way (seat 4 receives 47 % more tokens and uses them) and Windfall's last-place bonus lands on seat 4 most often, but neither offsets the ~₵45 Net Worth gap or the 8-point win-rate gap.

## 7. EXPERIMENT — randomised seat assignment vs. player fairness (14 Sep 2026)

**Status: simulator experiment only. Not a design decision, not a rule change.** Engine, rules, constants, bots and UI are untouched.

Question: if the player→seat assignment is randomised each match, does the persistent seat advantage disappear at the *player* level?

Finding about the architecture first: the engine **already** deals players to seats with a seeded Fisher–Yates shuffle at `START_MATCH` (locked Q-02) — three RNG draws that precede the first dice roll and are announced in `MATCH_STARTED.seatOrder`. The §6 "fixed-seat" table was therefore grouped by *physical seat* (turn-order slot), with player IDs already rotating through the seats. No extra RNG is consumed by this experiment; `fd-sim seats --by player` simply re-groups the *same* matches by player ID. The physical-seat numbers below are bit-for-bit identical to §6, which is the cleanest possible control.

Command: `node packages/simulator/src/cli.ts seats --matches 10000 --players 4 --bots random,random,random,random --seed 42 --by both`

| | seat 1 | seat 2 | seat 3 | seat 4 | | p1 | p2 | p3 | p4 |
|---|---|---|---|---|---|---|---|---|---|
| win rate | 29.6 % | 26.1 % | 23.1 % | 21.3 % | | 24.6 % | 24.6 % | 24.8 % | 26.0 % |
| mean final NW | ₵1,607 | ₵1,590 | ₵1,576 | ₵1,562 | | ₵1,582 | ₵1,582 | ₵1,583 | ₵1,588 |
| NW end R2 | 1,199 | 1,193 | 1,188 | 1,182 | | 1,190 | 1,190 | 1,190 | 1,191 |
| NW end R4 | 1,337 | 1,327 | 1,318 | 1,309 | | 1,322 | 1,323 | 1,322 | 1,324 |
| NW end R6 | 1,380 | 1,369 | 1,359 | 1,350 | | 1,363 | 1,364 | 1,364 | 1,366 |
| NW end R8 | 1,477 | 1,465 | 1,453 | 1,442 | | 1,457 | 1,458 | 1,458 | 1,462 |
| NW end R10 | 1,537 | 1,524 | 1,513 | 1,497 | | 1,516 | 1,517 | 1,517 | 1,520 |
| NW end R12 | 1,607 | 1,590 | 1,576 | 1,562 | | 1,582 | 1,582 | 1,583 | 1,588 |
| bought at list | 1.05 | 0.87 | 0.73 | 0.60 | | 0.81 | 0.82 | 0.80 | 0.83 |
| yield ₵ received / paid | 92 / 70 | 82 / 78 | 78 / 85 | 71 / 89 | | 81 / 80 | 80 / 80 | 81 / 81 | 81 / 81 |
| Leverage received | 2.56 | 2.95 | 3.33 | 3.76 | | 3.18 | 3.16 | 3.15 | 3.10 |

Seat mix per player is uniform (each player sits in each seat 24.2–25.9 % of the time; χ² 14.6 on 9 df, well under the p = 0.001 critical value 27.9). The standard error of a 25 % win rate over 10,000 matches is ±0.43 pp; p4's 26.0 % is ~2.3 SE and did not persist in a replication with seed 5000 (24.4 / 24.9 / 25.3 / 25.5 %; by seat 30.0 / 25.4 / 23.2 / 21.4 %).

**Answer to the question asked:** yes — at the player level, over many matches, the advantage vanishes: every player ID wins ~25 % and ends within ₵6 of each other at every snapshot, because the engine already randomises seats.

**What this does *not* say:** the within-match turn-order advantage is unchanged — seat 1 still wins 29.6–30.0 % vs seat 4's 21.3–21.4 %, and the gap is present from round 2. Randomised seating makes the game fair *in expectation across matches*; it does not make any single match fair between the person who happens to go first and the person who goes last. Whether a ~1.4× first-seat edge inside a 15-minute match is acceptable is a design question this experiment cannot answer.

## 8. Not measured yet

Per-round Pulse impact attribution; anything about human decision time. Both need further simulator instrumentation.
