# ADR-0001: The rules engine is a pure, deterministic, dependency-free TypeScript package

**Status:** Accepted (Phase 0)

## Context

Fortune District needs the same rules to run in three places: the authoritative Colyseus server, a headless balance simulator, and (for local pre-validation) the browser client. The v0.1 design has several interacting economic systems (payment cap, debt with interest, leverage tokens, decline auctions, City Pulse) whose balance cannot be judged by playtesting alone at 15 minutes per match — thousands of simulated matches are required.

## Decision

`@fortune-district/engine` is:

- **Pure:** `applyCommand(state, command)` returns a new state and events; it never mutates inputs, performs I/O, reads clocks, or calls `Math.random()`.
- **Deterministic:** all randomness is drawn from a seeded PRNG stored in `state.rng`.
- **Plain data:** `GameState` is JSON-serialisable (no classes, Maps, Sets, Dates).
- **Dependency-free:** zero runtime dependencies. No Colyseus, no Phaser, no React, no utility libraries.
- **Erasable-syntax TypeScript only:** no `enum`, no `namespace`, no parameter properties — so the source runs unmodified under Node's native type stripping and under any bundler.

## Consequences

- The simulator can run matches at memory speed; the server gets reproducible desync diagnostics from an event log; the client can validate a command before sending it.
- Colyseus `@colyseus/schema` becomes a transport encoding owned by the server, not the engine's state model. The server maps `PlayerView` → schema.
- Hidden information (sealed bids) must be handled by an explicit projection function, since the full state is a plain object anyone holding it can read.
- Some convenience is lost (no class methods on state); accepted.
