import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AUCTION_BID_WINDOW_SECONDS, TURN_TIMER_SECONDS } from '../src/engine.ts';
import { harness, legalFor, sendCommand, start } from './harness.ts';
import type { Harness } from './harness.ts';

const TURN_MS = TURN_TIMER_SECONDS * 1000;
const AUCTION_MS = AUCTION_BID_WINDOW_SECONDS * 1000;

function record(h: Harness) {
  return h.session.record()!.commands;
}

/** Drive until an auction is open (the active player declines an offer). */
function reachAuction(h: Harness): void {
  for (let i = 0; i < 400 && h.state()!.phase.kind !== 'auction'; i++) {
    const s = h.state()!;
    if (s.phase.kind !== 'turn') break;
    const p = s.phase.activePlayer;
    const legal = legalFor(h, p);
    const pick = legal.find((c) => c.type === 'ADVANCE') ?? legal.find((c) => c.type === 'DECLINE_PROPERTY') ?? legal.find((c) => c.type === 'END_TURN');
    if (!pick) break;
    sendCommand(h, p, pick);
  }
  assert.equal(h.state()!.phase.kind, 'auction', 'reached an auction');
}

test('timers: official values — 20 000 ms per decision, 10 000 ms per sealed-auction window — read from engine constants', () => {
  assert.equal(TURN_MS, 20_000);
  assert.equal(AUCTION_MS, 10_000);
  const h = harness(['Maya', 'Ravi']);
  start(h);
  const d = h.session.deadline!;
  assert.equal(d.kind, 'turn');
  assert.equal(d.totalMs, 20_000);
  assert.equal(d.endsAt - d.serverNow, 20_000);
  assert.equal(d.serverNow, h.clock.now());
  const s = h.state()!;
  assert.equal(s.phase.kind === 'turn' && s.phase.activePlayer, d.actor);
});

test('timers: advance(19 999) does nothing; advance(1) issues exactly one host TURN_TIMED_OUT that enters the engine and the replay log', () => {
  const h = harness(['Maya', 'Ravi']);
  start(h);
  const before = h.session.commandCount;
  const epoch = h.session.epoch;
  h.clock.advance(19_999);
  assert.equal(h.session.commandCount, before);
  assert.equal(h.session.epoch, epoch);
  h.clock.advance(1);
  assert.equal(h.session.commandCount, before + 1);
  const cmd = record(h).at(-1)!;
  assert.deepEqual(cmd, { type: 'TURN_TIMED_OUT', by: 'host' });
  assert.ok(h.session.eventLog().some((e) => e.type === 'TURN_TIMED_OUT'), 'the engine applied the step default');
  assert.ok(h.session.epoch > epoch, 'a new decision was armed');
  assert.equal(h.session.deadline?.kind, 'turn');
});

test('timers: a stale timer callback is a no-op once the player has acted (epoch check)', () => {
  const h = harness(['Maya', 'Ravi']);
  start(h);
  const s = h.state()!;
  const p = s.phase.kind === 'turn' ? s.phase.activePlayer : '';
  const epochBefore = h.session.epoch;
  h.clock.advance(15_000);
  sendCommand(h, p, legalFor(h, p).find((c) => c.type === 'ADVANCE')!); // acted at 15 s → new decision, new epoch
  assert.ok(h.session.epoch > epochBefore);
  const count = h.session.commandCount;
  h.clock.advance(5_000); // the old 20 s deadline would have fallen here
  assert.equal(h.session.commandCount, count, 'no timeout from the superseded deadline');
  assert.ok(!record(h).some((c) => c.type === 'TURN_TIMED_OUT'));
  h.clock.advance(15_000); // the new deadline (armed at 15 s) expires at 35 s
  assert.equal(record(h).at(-1)!.type, 'TURN_TIMED_OUT');
});

test('timers: one shared 10 s auction window; bids do not extend it; expiry closes with absent bids as no bid', () => {
  const h = harness(['Maya', 'Ravi', 'Lee']);
  start(h);
  reachAuction(h);
  const d = h.session.deadline!;
  assert.equal(d.kind, 'auction');
  assert.equal(d.actor, null);
  assert.equal(d.totalMs, 10_000);
  const a = h.state()!.auction!;
  h.clock.advance(4_000);
  const bidder = a.eligible.find((id) => legalFor(h, id).some((c) => c.type === 'SUBMIT_SEALED_BID'))!;
  sendCommand(h, bidder, legalFor(h, bidder).find((c) => c.type === 'SUBMIT_SEALED_BID')!);
  assert.equal(h.state()!.phase.kind, 'auction', 'others still pending');
  assert.equal(h.session.deadline!.endsAt, d.endsAt, 'a bid does not extend the window');
  h.clock.advance(5_999);
  assert.equal(h.state()!.phase.kind, 'auction');
  h.clock.advance(1);
  assert.equal(record(h).at(-1)!.type, 'CLOSE_AUCTION');
  assert.equal(record(h).at(-1)!.by, 'host');
  const resolved = h.session.eventLog().filter((e) => e.type === 'AUCTION_RESOLVED').at(-1)!;
  assert.ok(resolved.type === 'AUCTION_RESOLVED' && resolved.winner === bidder && Object.keys(resolved.revealedBids).length === 1, 'only the one bid existed');
  assert.equal(h.state()!.phase.kind, 'turn', 'back to the opener');
  assert.equal(h.session.deadline?.kind, 'turn');
});

test('timers: the auction closes early (host CLOSE_AUCTION) when every eligible bidder has bid or declared NO_BID', () => {
  const h = harness(['Maya', 'Ravi', 'Lee']);
  start(h);
  reachAuction(h);
  const a = h.state()!.auction!;
  const count = h.session.commandCount;
  const bidders = a.eligible.filter((id) => legalFor(h, id).some((c) => c.type === 'SUBMIT_SEALED_BID'));
  for (const id of bidders.slice(1)) h.session.handle(h.clients[id]!, { type: 'NO_BID' });
  assert.equal(h.state()!.phase.kind, 'auction');
  assert.equal(h.session.commandCount, count, 'NO_BID is session metadata, not an engine command');
  sendCommand(h, bidders[0]!, legalFor(h, bidders[0]!).find((c) => c.type === 'SUBMIT_SEALED_BID')!);
  assert.deepEqual(record(h).slice(-2).map((c) => c.type), ['SUBMIT_SEALED_BID', 'CLOSE_AUCTION']);
  assert.ok(!record(h).some((c) => (c as { type: string }).type === 'NO_BID'));
  assert.equal(h.state()!.phase.kind, 'turn');
});

test('timers: a disconnected active player keeps timing out under normal rules — the match never pauses', () => {
  const h = harness(['Maya', 'Ravi']);
  start(h);
  const s = h.state()!;
  const active = s.phase.kind === 'turn' ? s.phase.activePlayer : '';
  h.session.leave(h.clients[active]!);
  assert.equal(h.lastView(active === 'p1' ? 'p2' : 'p1')!.presence.players[active]!.connected, false);
  const before = h.session.commandCount;
  h.clock.advance(20_000);
  assert.equal(h.session.commandCount, before + 1);
  assert.equal(record(h).at(-1)!.type, 'TURN_TIMED_OUT');
  h.clock.advance(20_000);
  assert.ok(h.session.commandCount >= before + 2, 'timeouts keep coming while they are away');
});

test('timers: nothing is armed after the match ends', () => {
  const h = harness(['Maya', 'Ravi']);
  start(h);
  // Let the whole match time out: 12 rounds × 2 players × ≤ 3 decisions.
  for (let i = 0; i < 400 && h.session.roomPhase === 'playing'; i++) h.clock.advance(20_000);
  assert.equal(h.session.roomPhase, 'finished');
  assert.equal(h.session.deadline, null);
  assert.equal(h.clock.pending, 0);
  const count = h.session.commandCount;
  h.clock.advance(60_000);
  assert.equal(h.session.commandCount, count);
});
