# Fortune District — Architecture

**Scope of this document:** the system structure required to build the v1 rules engine and the headless simulator, and the boundaries the later server and client must respect. Decisions are recorded as ADRs in [adr/](adr/).

---

## 1. Goals the architecture must serve

1. **One rules implementation.** The server, the simulator, and (for prediction/validation) the client all run the *same* engine code. There is no second copy of the rules anywhere.
2. **Determinism.** Given the same seed and the same command sequence, the engine produces the same state and event log, byte for byte. This is what makes the simulator trustworthy and makes bugs reproducible from a match log.
3. **Headless speed.** The simulator must run thousands of full 12-round matches per minute with no rendering, no network, no timers.
4. **Hidden information is enforceable.** Sealed auction bids must be redactable per player without the engine knowing about players' network sessions.
5. **Extensible without rewrite.** v1.1 Exchange window and v2 deal-making (both out of scope) must be addable as new commands/events/phases, not as a re-architecture.

---

## 2. Repository layout (npm workspaces monorepo)

```
fortune-district/
├── docs/                      Design + architecture (this folder)
│   └── adr/                   Architecture Decision Records
├── packages/
│   ├── engine/                @fortune-district/engine — pure rules engine (Phase 1)
│   └── simulator/             @fortune-district/simulator — headless match runner (Phase 2)
├── apps/
│   ├── server/                Colyseus authoritative server (Phase 3)
│   └── client/                React + Phaser client (Phase 4)
├── package.json               Workspace root
└── tsconfig.base.json         Shared strict TS config
```

Dependency direction is strictly one-way:

```
client ──▶ engine ◀── server
                ▲
                └── simulator
```

`engine` depends on **nothing** (zero runtime dependencies — enforced by review). `simulator` depends only on `engine`. `server` and `client` depend on `engine` and never on each other or on `simulator`.

See [ADR-0003](adr/0003-monorepo-layout.md).

---

## 3. The engine: pure, deterministic, command → event

### 3.1 Shape

The engine exposes a single reducer-style entry point (types in `packages/engine/src/types.ts`):

```
applyCommand(state: GameState, command: Command): ApplyResult
  ApplyResult = { ok: true;  state: GameState; events: GameEvent[] }
              | { ok: false; error: RuleViolation }
```

- `GameState` is a **plain JSON-serialisable value**. No classes, no `Date`, no `Map`/`Set`, no functions.
- `applyCommand` is a **pure function**: no I/O, no `Date.now()`, no `Math.random()`, no mutation of its inputs.
- Every state change is described by one or more `GameEvent`s. Events are the audit log, the replay source, and the client's animation feed.
- Rejected commands return a `RuleViolation` instead of throwing. Hosts decide whether to surface, log, or ignore.

See [ADR-0001](adr/0001-pure-deterministic-engine.md), [ADR-0002](adr/0002-command-event-model.md).

### 3.2 Randomness

All randomness comes from a seeded PRNG whose state lives **inside `GameState`** (`state.rng`). Drawing a random number advances `state.rng` and is therefore part of the reducer's output. The host supplies the seed once at `START_MATCH`. Which game mechanics consume randomness is determined by Q-01 (movement) and Q-14 (City Pulse selection); the plumbing is decided now.

### 3.3 Time lives outside the engine

The engine has **no clocks**. The 20-second turn timer and the 10-second auction window are enforced by the host (server or simulator), which expresses expiry as ordinary commands: `TURN_TIMED_OUT`, `CLOSE_AUCTION`. The engine only needs to know *that* time ran out, never *when*.

Consequences:

- The simulator can run a full match with zero wall-clock delay.
- Timer semantics on expiry (Q-03) are an engine rule; timer *duration* is a host configuration read from `constants.ts`.

See [ADR-0004](adr/0004-time-outside-engine.md).

### 3.4 Phase machine

`state.phase` is a discriminated union. The v1 phases that are certain from the spec:

| Phase | Meaning | Exits via |
|---|---|---|
| `lobby` | Match created, players seated, not started | `START_MATCH` |
| `turn` | Active player's 20 s window | player commands, `END_TURN`, `TURN_TIMED_OUT` |
| `auction` | Sealed 10 s bidding on a declined property | `SUBMIT_SEALED_BID` × n, then `CLOSE_AUCTION` |
| `city_pulse` | Resolving a City Pulse at rounds 4 / 7 / 10 | engine-internal, emits events, returns to `turn` |
| `ended` | Round 12 complete; rankings computed | terminal |

Sub-steps inside `turn` (e.g. "awaiting buy/decline decision") depend on Q-01/Q-03 and are left to Phase 1. The union is designed so v1.1 can add an `exchange` phase without touching existing variants.

### 3.5 Hidden information and per-player projection

`GameState` is the *full* authoritative state and contains every sealed bid. It must never be sent to a client as-is.

The engine provides `projectForPlayer(state, playerId): PlayerView` (Phase 1) which returns a copy with other players' pending bids removed (and any future hidden information handled the same way). The server sends **only** `PlayerView`s. Because the redaction rule lives in the engine, the server cannot accidentally leak by forgetting a field.

### 3.6 Invariants (checked in tests, and optionally at runtime in the simulator)

Invariants derivable from the spec today; more are added as Q items close:

- `players.length` ∈ [2, 4]
- `board.length === 24`; exactly 18 tiles have `kind: 'property'`; exactly 1 has `kind: 'district_hub'`
- `1 ≤ round ≤ 12` while `phase !== 'ended'`; `phase === 'ended'` ⇒ `round === 12` and turn cycle complete
- Every property is owned by at most one player
- `cash ≥ 0` and `debt ≥ 0` for every player (Q-11 determines the transition rule between them)
- City Pulse is applied exactly once at each of rounds 4, 7, 10, and each is telegraphed before it is applied
- Auction phase is only ever entered from a decline and exits only via `CLOSE_AUCTION`
- **Replay determinism:** `replay(seed, commands)` reproduces the final state hash

---

## 4. The simulator

Location: `packages/simulator`. Detailed requirements in [SIMULATOR_SPEC.md](SIMULATOR_SPEC.md).

The simulator is a **host** for the engine, in exactly the same sense the Colyseus server is a host:

```
for each match:
  state = engine.createInitialState(config, seed)
  while state.phase !== 'ended':
    actor = whoseDecision(state)           // engine helper
    cmd   = bots[actor].decide(view(state)) // bot sees only its PlayerView
    { state, events } = engine.applyCommand(state, cmd)
    collector.record(events)
```

Timers are simulated by asking bots for a decision and, if a bot returns `null` (undecided), issuing `TURN_TIMED_OUT`. Bots implement a small `Bot` interface and never touch state directly.

Outputs are aggregate metrics (turn counts, match "duration" in turn-seconds, net-worth spread, debt frequency, auction frequency, City Pulse impact) plus per-match event logs for replay.

---

## 5. Server (Phase 3 — boundaries only)

- Colyseus room per match. The room owns the **authoritative `GameState`** and is the only place `applyCommand` runs for a live match.
- Client messages are validated *by the engine* (a client sending an illegal command gets a `RuleViolation`, not a crash).
- Room broadcasts `PlayerView`s (never raw state) after each accepted command.
- Room runs the 20 s / 10 s timers and injects `TURN_TIMED_OUT` / `CLOSE_AUCTION`.
- Colyseus `@colyseus/schema` is used only as a **transport encoding of `PlayerView`**; it is not the source of truth and the engine does not import it. This keeps the engine free of Colyseus and lets the simulator skip schema entirely.

---

## 6. Client (Phase 4 — boundaries only)

- React owns UI chrome (lobby, HUD, timers, auction bid entry, City Pulse telegraph banner).
- Phaser owns the board render and animation, driven by the **event stream** (`GameEvent[]`), not by diffing state.
- The client may import `engine` to pre-validate a command locally before sending it (instant feedback), but the server's verdict is final.

---

## 7. Extension points reserved for v1.1 / v2 (not implemented)

| Future feature | How it slots in |
|---|---|
| v1.1 Exchange window | New `phase` variant `exchange`; new commands/events; a new host-driven timer command. No change to existing variants. |
| v2 deal-making | New commands (propose/accept/reject), new events, possibly a per-player pending-offer list in `PlayerState`. Hidden-offer redaction reuses `projectForPlayer`. |

The `Command` and `GameEvent` unions and the `phase` union are the only places these land. Nothing in v1 should assume those unions are closed.

---

## 8. What Phase 0 deliberately does *not* decide

- Internal module split of the engine (movement / payments / auctions / pulse) — Phase 1, after P1 questions close.
- Bot strategies — Phase 2.
- Colyseus room lifecycle, matchmaking, reconnection — Phase 3.
- Client state management library, Phaser scene structure — Phase 4.
- Test runner choice — Phase 1 (recommendation: whatever is lightest that runs TS natively on Node 24; decided when first test is written).
