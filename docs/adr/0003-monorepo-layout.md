# ADR-0003: npm-workspaces monorepo with one-way dependency flow

**Status:** Accepted (Phase 0)

## Context

Four deliverables share code: engine, simulator, Colyseus server, React/Phaser client. They must share the engine *by import*, not by copy, and the engine must not accidentally absorb server or client concerns.

## Decision

Single repository, npm workspaces (no extra tooling), TypeScript throughout:

```
packages/engine      @fortune-district/engine      (Phase 1)
packages/simulator   @fortune-district/simulator   (Phase 2)
apps/server          Colyseus                      (Phase 3)
apps/client          React + Vite + Phaser         (Phase 4)
```

Allowed imports:

| From \ To | engine | simulator | server | client |
|---|---|---|---|---|
| **engine** | — | ✗ | ✗ | ✗ |
| **simulator** | ✓ | — | ✗ | ✗ |
| **server** | ✓ | ✗ | — | ✗ |
| **client** | ✓ | ✗ | ✗ | — |

`packages/` = libraries, `apps/` = deployables. A shared `tsconfig.base.json` enforces `strict`, `isolatedModules`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUncheckedIndexedAccess`.

Node ≥ 24 (native TS type-stripping lets the engine and simulator run and be syntax-checked without a build step).

## Consequences

- No pnpm/turbo/nx: fewer moving parts for a small team; can be added later without restructuring.
- The engine's `package.json` has no `dependencies` field at all; adding one is a reviewable, deliberate act.
- Phase 0 creates only the workspace root and the `engine`/`simulator` package shells. `apps/*` get placeholder READMEs and are scaffolded in their own phases so we don't carry a half-configured Vite/Colyseus setup for weeks.
