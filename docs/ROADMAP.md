# Roadmap — Fortune District

Phases are sequential. Each phase ends with a stop-and-review; no phase begins automatically.

| Phase | Deliverable | Depends on | Status |
|---|---|---|---|
| **0** | Design docs, open-questions register, architecture + ADRs, workspace skeleton, engine type contracts and constants (no logic) | — | **Done** — this commit |
| **1** | Rules engine: `createInitialState`, `applyCommand`, `projectForPlayer`, `whoseDecision`, `legalCommands`, `computeNetWorth`, `hashState`; PRNG; acceptance tests from RULES_ENGINE_SPEC §7 | All **P1** items in OPEN_QUESTIONS resolved | Not started |
| **2** | Headless simulator: bots, batch runner, metrics, determinism self-check, replay | Phase 1; **P2** items resolved | Not started |
| **3** | Colyseus server: room per match, `PlayerView` schema transport, timers, reconnection basics | Phase 1 (Phase 2 strongly recommended first for balance) | Not started |
| **4** | React + Phaser client: lobby, board, HUD, timers, auction UI, City Pulse telegraph | Phase 3 | Not started |
| **5** | v1 hardening: balance passes from simulator data, playtest fixes, deploy | Phases 2–4 | Not started |

## Out of scope for v1 (do not build)

| Version | Feature | Architectural hook already reserved |
|---|---|---|
| v1.1 | Exchange window | new `phase` variant + commands/events (ARCHITECTURE §7) |
| v2 | Deal-making expansion | new commands/events; hidden offers via `projectForPlayer` |
| — | Anything on the v1 exclusions list (Q-18 — to be transcribed) | — |

## Phase 1 entry criteria

Phase 1 may start when every **P1** row in [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) is closed and its resolution is written into [GAME_DESIGN_v0.1.md](GAME_DESIGN_v0.1.md). Until then, Phase 1 work would be guessing at rules, which the originality requirement (§10) specifically forbids.
