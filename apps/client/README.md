# apps/client — React + Phaser client

**Phase 4 — not yet scaffolded.** Placeholder to fix the repository layout ([ADR-0003](../../docs/adr/0003-monorepo-layout.md)).

Responsibilities (see [ARCHITECTURE.md §6](../../docs/ARCHITECTURE.md)):

- React: lobby, HUD, turn/auction timers, sealed-bid entry, City Pulse telegraph banner.
- Phaser: 24-tile circular board render and animation, driven by the `GameEvent` stream.
- May import `@fortune-district/engine` to pre-validate commands locally; the server's verdict is final.
- Presentation must respect the originality requirement ([GAME_DESIGN_v0.1.md §10](../../docs/GAME_DESIGN_v0.1.md)).
