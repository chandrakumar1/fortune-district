# Fortune District

An original, fast economic board game: **15-minute matches, 2–4 players, 24-tile circular board, 12 rounds, 20-second turns.** Highest Net Worth after round 12 wins.

Distinguishing systems: a 25% payment cap, debt with 10% interest, Leverage tokens, decline auctions with 10-second sealed bidding, and telegraphed City Pulse events at rounds 4, 7 and 10. Fortune District deliberately does **not** follow Monopoly / RichUp-style structures.

## Source of truth

| Document | Purpose |
|---|---|
| [docs/GAME_DESIGN_v0.1.md](docs/GAME_DESIGN_v0.1.md) | The v0.1 rules. Everything else derives from this. |
| [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md) | Rules whose details are not yet recorded. **Nothing is implemented for these until closed.** |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System structure: pure engine, headless simulator, Colyseus server, React/Phaser client. |
| [docs/RULES_ENGINE_SPEC.md](docs/RULES_ENGINE_SPEC.md) | Engine API, state model, commands, events, acceptance tests. |
| [docs/SIMULATOR_SPEC.md](docs/SIMULATOR_SPEC.md) | Simulator requirements and metrics. |
| [docs/adr/](docs/adr/) | Architecture Decision Records. |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phases 0–5 and what is out of scope (v1.1 Exchange window, v2 deal-making). |

## Repository layout

```
packages/engine      pure deterministic rules engine          (Phase 1)
packages/simulator   headless batch simulator                 (Phase 2)
apps/server          Colyseus authoritative server            (Phase 3)
apps/client          React + Phaser client                    (Phase 4)
```

Stack: TypeScript, React, Phaser, Colyseus, Node ≥ 24, npm workspaces.

## Status

**Phase 0 complete:** documentation, architecture, workspace skeleton, engine type contracts and constants. No game logic yet. Phase 1 (rules engine) starts once the P1 items in [OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md) are resolved.

## Getting started

```sh
npm install          # installs TypeScript only (no runtime deps anywhere yet)
npm run syntax-check # Node-native TS syntax check; works without install
npm run typecheck    # full type-check across workspaces
```
