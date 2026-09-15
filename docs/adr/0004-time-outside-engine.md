# ADR-0004: Timers live in the host; the engine receives expiry as commands

**Status:** Accepted (Phase 0)

## Context

v0.1 specifies a 20-second turn timer and a 10-second sealed-bid window. A simulator that had to actually wait would take 15 minutes per match. A server that let the engine own timers would couple rules to `setTimeout` and make replay impossible.

## Decision

- The engine contains **no clock** and never reads wall time.
- The **host** (Colyseus room, or simulator loop) starts timers when it observes `TURN_STARTED` / `AUCTION_OPENED` events and, on expiry, issues `TURN_TIMED_OUT` / `CLOSE_AUCTION` commands with `by: 'host'`.
- Timer **durations** (20 s, 10 s) are exported from `engine/src/constants.ts` so every host uses the spec values, but the engine only *exports* them, it never *waits* on them.
- What happens on expiry (auto-decline, auto-end, default action — Q-03) is an engine rule, implemented in the handler for `TURN_TIMED_OUT`.

## Consequences

- Simulator: a bot returning `null` is equivalent to a timeout; the loop issues the expiry command immediately.
- Server: must cancel a pending timer when the player acts first (ordinary room bookkeeping).
- The event log contains every timeout explicitly, so replays and metrics see them.
- A late client message that arrives after `TURN_TIMED_OUT` was applied is rejected by the engine with `NOT_YOUR_TURN` / `WRONG_PHASE` — no race-condition handling needed in the rules.
