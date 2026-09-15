# apps/server — Colyseus authoritative server

**Phase 3 — not yet scaffolded.** Placeholder to fix the repository layout ([ADR-0003](../../docs/adr/0003-monorepo-layout.md)).

Responsibilities (see [ARCHITECTURE.md §5](../../docs/ARCHITECTURE.md)):

- One Colyseus room per match, owning the authoritative `GameState`.
- Runs the 20 s turn timer and 10 s auction window; injects `TURN_TIMED_OUT` / `CLOSE_AUCTION` ([ADR-0004](../../docs/adr/0004-time-outside-engine.md)).
- Broadcasts `PlayerView`s only — never raw `GameState`. `@colyseus/schema` is the transport encoding, not the source of truth.
- Imports `@fortune-district/engine`; never imports `simulator` or `client`.
