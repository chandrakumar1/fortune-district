# Simulator Specification — `@fortune-district/simulator`

The simulator is a headless host for the engine. Its job is to answer balance questions about the v0.1 design *before* the server and client exist, and to keep answering them as rules change. It is built in **Phase 2**; this document fixes its requirements now so the Phase 1 engine exposes what it needs.

---

## 1. Requirements

| # | Requirement |
|---|---|
| S1 | Runs a full 12-round match with **no wall-clock delay** — timers are decisions, not waits. |
| S2 | ≥ 1,000 four-player matches per minute on a laptop (target; measured in Phase 2). |
| S3 | **Deterministic:** same seed + same bot set → identical event log. Verified by a built-in self-check. |
| S4 | Bots see only `PlayerView` (engine `projectForPlayer`), never raw `GameState`. A bot cannot read another's sealed bid. |
| S5 | Emits per-match event logs (JSON lines) suitable for replay through the engine. |
| S6 | Emits aggregate metrics (below) as JSON and a human-readable table. |
| S7 | Zero dependencies beyond `@fortune-district/engine` and Node built-ins. |

---

## 2. Bot interface (Phase 2)

```
interface Bot {
  readonly name: string
  decide(view: PlayerView, legal: Command[]): Command | null
    // null = "no decision in time" → host issues TURN_TIMED_OUT / omits bid
  bid(view: PlayerView, auction: AuctionView): number | null
}
```

The engine supplies `legal` (Phase 1 helper `legalCommands(state, playerId)`) so bots cannot construct illegal commands and the simulator never has to special-case rules.

Phase 2 ships at minimum: `RandomBot` (uniform over legal), `PassiveBot` (never buys, never bids), `GreedyBot` (buys whenever affordable, bids cash-proportionally). These are for exercising the rules, not for playing well.

---

## 3. Metrics (per batch)

Metrics that follow directly from v0.1's stated goals and systems:

| Metric | Why it matters |
|---|---|
| Simulated match duration (Σ turn-seconds, using the 20 s cap for timeouts and actual per-bot latency otherwise) | 15-minute target (§1) |
| Turns per match, auctions per match | Pace |
| Net Worth spread at end (max − min, Gini) | Is the match competitive through round 12? |
| Fraction of matches where round-12 leader ≠ round-6 leader | Does the fixed-round structure keep late rounds meaningful? |
| Payments capped (%) and ₵ withheld by the 25% cap | Is the cap active or dead? (§5.1) |
| Debt: % of players who incur it, mean peak debt, interest paid | Debt system health (§5.2) |
| Leverage token usage rate | (§5.3, after Q-12) |
| Decline rate, auction win price vs. list price, zero-bid auctions | Auction system health (§4.5) |
| Category set completion rate; ×2 bonus payments as % of all payments | Set bonus relevance (§4.4) |
| Net Worth delta attributable to each City Pulse (rounds 4, 7, 10) | City Pulse impact (§6) |
| Win rate by seat position | Fairness of turn order (Q-02) |

---

## 4. CLI shape (Phase 2)

```
fd-sim run  --matches 1000 --players 4 --bots greedy,random,random,passive --seed 42
fd-sim replay --log match-0001.jsonl          # re-run through engine, assert same hash
fd-sim check-determinism --matches 100        # S3 self-check
```

---

## 5. What the engine must expose for this to work (Phase 1 obligations)

- `createInitialState`, `applyCommand`, `projectForPlayer`, `whoseDecision`, `legalCommands`, `computeNetWorth`, `hashState`
- Events rich enough to compute §3 metrics **without** inspecting raw state (e.g. `PAYMENT_MADE` carries `requested`, `paid`, `capped`).
- No hidden dependency on wall-clock or environment.
