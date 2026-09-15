# @fortune-district/simulator

Headless match runner for balance analysis (Phase 2 foundation).

- Spec: [docs/SIMULATOR_SPEC.md](../../docs/SIMULATOR_SPEC.md)
- Depends only on `@fortune-district/engine` and Node built-ins.

## Usage (no install needed on Node ≥ 24)

```sh
node src/cli.ts run --matches 1000 --players 4 --bots greedy,random,random,passive --seed 42
node src/cli.ts run --matches 100 --json            # machine-readable metrics
node src/cli.ts run --matches 10 --log > out.jsonl  # per-match command logs
node src/cli.ts check-determinism --matches 100     # S3 self-check
node src/cli.ts replay --log out.jsonl              # replay through the engine, assert hashes
node --test test/*.test.ts
```

Bots: `random` (uniform over legal commands), `passive` (never buys/bids/upgrades), `greedy` (buys and upgrades whenever affordable, forces auctions with tokens, bids ¼ cash), `timeout` (never decides — exercises the timeout defaults). Movement is never a decision: every player moves exactly the sum of the two dice. They exist to exercise the rules, not to play well.

## Engine import

`src/engine.ts` re-exports the engine by relative path until `npm install` links the workspaces; then it becomes `export * from '@fortune-district/engine'` (one line). Nothing else imports the engine directly.

## Per-seat analysis

`node src/cli.ts seats --matches 10000 --players 4 --bots random,random,random,random --seed 42 [--by seat|player|both]` prints win rate, Net Worth by round, Hub bonuses, ownership (list vs auction), upgrade spend, yield flows, cap hits, debt, interest, Leverage and Windfall per physical seat (turn-order slot) or per player id (`computeSeatStats(records, groupBy)`). The engine already deals players to seats with a seeded shuffle at `START_MATCH`, so grouping by player measures fairness across matches while grouping by seat measures the within-match turn-order effect; the analysis is post-hoc and consumes no RNG.

## Metrics

Endgame instrumentation (`computeEndgameMetrics`, printed after the summary): per-round buys / auctions / upgrades / Leverage / yield flow / capped payments / new debt / Hub bonuses / timeouts, per-round |ΔNW| per player, spread and lead margin, leader-at-round-r-wins curve, leader changes between consecutive rounds, the winner's rank at the end of R6 / R8 / R10, ranking changes after R10, and last-place escapes. `MatchRecord.netWorthByRound[0..12]` holds the engine's Net Worth per player before play and at the end of each round.

Per SIMULATOR_SPEC §3: simulated match length, commands, timeouts, auctions (zero-bid rate, price/list), yield payments (capped rate, ₵ withheld), debt incidence / peak / interest, Leverage granted / used by kind, Pulse rerolls, complete sets, properties owned at end, Net Worth spread, leader change after round 6, win rate by seat.
