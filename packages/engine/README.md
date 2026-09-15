# @fortune-district/engine

Pure, deterministic rules engine for Fortune District v0.1.

- Spec: [docs/RULES_ENGINE_SPEC.md](../../docs/RULES_ENGINE_SPEC.md)
- Design source of truth: [docs/GAME_DESIGN_v0.1.md](../../docs/GAME_DESIGN_v0.1.md)
- Decisions: [ADR-0001](../../docs/adr/0001-pure-deterministic-engine.md), [ADR-0002](../../docs/adr/0002-command-event-model.md), [ADR-0004](../../docs/adr/0004-time-outside-engine.md)

## Hard rules for this package

1. **Zero runtime dependencies.** `package.json` has no `dependencies` field. Keep it that way.
2. **No I/O, no clocks, no `Math.random()`.** All randomness via `state.rng`.
3. **Plain data only.** `GameState` must survive `JSON.parse(JSON.stringify(state))` unchanged.
4. **Erasable TypeScript only.** No `enum`, `namespace`, or parameter properties — the source must run under Node 24's native type stripping.
5. **No guessing at OPEN rules.** If a rule is marked `OPEN (Q-nn)` in the design doc, its handler is not written until the question is closed.

## Status

**Phase 0** — `src/constants.ts` (spec parameters) and `src/types.ts` (state / command / event contracts) only. No logic.

## Checks

```sh
node --check src/index.ts && node --check src/types.ts && node --check src/constants.ts   # syntax, no install needed
npm run typecheck   # full type-check; requires `npm install` at the repo root first
```
