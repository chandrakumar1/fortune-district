# ADR-0002: Command → Event model with an append-only event log

**Status:** Accepted (Phase 0)

## Context

The client must animate what happened (a move, a capped payment, a City Pulse), the simulator must compute metrics about what happened, and bugs must be reproducible from a match record. Diffing two `GameState` snapshots loses causality (why did cash drop — a payment, interest, an auction?).

## Decision

- Inputs to the engine are **Commands** (intent: `BUY_PROPERTY`, `SUBMIT_SEALED_BID`, `TURN_TIMED_OUT`, …). Each carries `by: PlayerId | 'host'`.
- Outputs are **Events** (fact: `PROPERTY_PURCHASED`, `PAYMENT_MADE { requested, paid, capped }`, `CITY_PULSE_TELEGRAPHED`, …), appended to `state.eventLog` and returned from `applyCommand`.
- Illegal commands produce a `RuleViolation` result — never an exception, never a partial state change, never an event.
- **Every** state mutation is accompanied by at least one event. A mutation with no event is a bug.
- Events carry enough data to compute simulator metrics and drive client animation **without** reading raw state.
- Host-driven time (turn expiry, auction close) enters as commands, so the log is complete: replaying `(seed, commands[])` reproduces the match.

## Consequences

- `Command` and `GameEvent` are discriminated unions that v1.1 (Exchange window) and v2 (deal-making) extend by adding variants.
- `BID_RECEIVED` has a public form without the amount so the event feed can be broadcast without leaking sealed bids; `AUCTION_RESOLVED` reveals amounts per Q-13.
- `eventLog` grows over a match; at 12 rounds × 4 players this is small and acceptable. If it ever matters, the log can be externalised without changing the model.
