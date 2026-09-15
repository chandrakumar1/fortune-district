import { test } from 'node:test';
import assert from 'node:assert/strict';

import { projectForPlayer } from '../src/engine.ts';
import type { GameState, PlayerId } from '../src/engine.ts';
import { harness, legalFor, playToEnd, sendCommand, start } from './harness.ts';

/** Every VIEW envelope must be exactly the engine's projection for its recipient: no rng, no bids object, no foreign amounts. */
test('redaction: every envelope equals projectForPlayer(state, recipient); rng and other players\' sealed bids never leave the session', () => {
  // Four recipients: one envelope per connected seat per broadcast (~150 broadcasts × 4 ≈ 600 envelopes).
  const h = harness(['Maya', 'Ravi', 'Lee', 'Ana']);
  start(h);
  let live = 0;
  const seen: { to: PlayerId; state: GameState; env: unknown }[] = [];
  // Walk the match manually so we can pair each sent envelope with the state that produced it.
  let sentIndex = h.sent.length;
  const check = () => {
    const state = h.state()!;
    for (const s of h.sent.slice(sentIndex)) {
      if (s.message.type !== 'VIEW') continue;
      seen.push({ to: s.to, state, env: s.message.envelope.playerView });
    }
    sentIndex = h.sent.length;
    if (state.phase.kind === 'auction' && state.auction && Object.keys(state.auction.bids).length > 0) live++;
  };
  check();
  for (let i = 0; i < 4000 && h.session.roomPhase === 'playing'; i++) {
    const s = h.state()!;
    if (s.phase.kind === 'auction' && s.auction) {
      // Bid one at a time so envelopes are emitted while sealed bids are live and others are still pending.
      const pending = s.auction.eligible.find((id) => s.auction!.bids[id] === undefined && legalFor(h, id).some((c) => c.type === 'SUBMIT_SEALED_BID'));
      if (pending) sendCommand(h, pending, legalFor(h, pending).find((c) => c.type === 'SUBMIT_SEALED_BID')!);
      else h.clock.advance(10_000);
      check();
      continue;
    }
    if (s.phase.kind !== 'turn') break;
    const p = s.phase.activePlayer;
    const legal = legalFor(h, p);
    const pick = legal.find((c) => c.type === 'ADVANCE') ?? legal.find((c) => c.type === 'DECLINE_PROPERTY') ?? legal.find((c) => c.type === 'UPGRADE_PROPERTY') ?? legal.find((c) => c.type === 'END_TURN')!;
    sendCommand(h, p, pick);
    check();
  }
  assert.equal(h.session.roomPhase, 'finished');
  assert.ok(live > 10, `envelopes were emitted while sealed bids were live (${live})`);
  assert.ok(seen.length > 500, `envelopes captured: ${seen.length}`);

  for (const { to, state, env } of seen) {
    assert.deepEqual(env, projectForPlayer(state, to), `envelope to ${to} is exactly the engine projection`);
    const text = JSON.stringify(env);
    assert.ok(!('rng' in (env as object)), 'no rng');
    assert.ok(!text.includes('"bids"'), 'no bids object anywhere in the view');
    const a = state.auction;
    if (state.phase.kind === 'auction' && a) {
      const view = env as ReturnType<typeof projectForPlayer>;
      assert.equal(view.state.auction?.myBid ?? null, a.bids[to] ?? null, 'only my own bid is visible');
      assert.ok(!('bids' in (view.state.auction ?? {})), 'the bids map is stripped');
      // No other bidder's amount appears in the live auction object or in any event since this auction opened
      // (earlier AUCTION_RESOLVED.revealedBids are public history and may legitimately repeat an amount).
      const openedSeq = [...view.state.eventLog].reverse().find((e) => e.type === 'AUCTION_OPENED')!.seq;
      const liveText = JSON.stringify({ auction: view.state.auction, since: view.state.eventLog.filter((e) => e.seq >= openedSeq) });
      for (const id of Object.keys(a.bids)) if (id !== to) assert.ok(!liveText.includes(`"${id}":${a.bids[id]}`) && !liveText.includes(`"amount":${a.bids[id]}`), `foreign bid ${id} leaked to ${to}`);
      assert.ok(!liveText.includes('revealedBids'), 'the live auction has not been resolved yet');
    }
  }
});

test('redaction: the rejoin token never appears in any envelope, rejection or replay record', () => {
  const h = harness(['Maya', 'Ravi']);
  start(h);
  playToEnd(h);
  const everything = JSON.stringify(h.sent) + JSON.stringify(h.session.record());
  for (const token of Object.values(h.tokens)) {
    assert.ok(token.length >= 40);
    assert.ok(!everything.includes(token), 'token leaked');
  }
});

test('redaction: AUCTION_RESOLVED reveals bids only after resolution, and BID_RECEIVED carries no amount', () => {
  const h = harness(['Maya', 'Ravi', 'Lee']);
  start(h);
  playToEnd(h);
  const log = h.session.eventLog();
  const received = log.filter((e) => e.type === 'BID_RECEIVED');
  assert.ok(received.length > 0);
  for (const e of received) assert.ok(!('amount' in e), 'BID_RECEIVED has no amount');
  const resolved = log.filter((e) => e.type === 'AUCTION_RESOLVED');
  assert.ok(resolved.length > 0);
  for (const e of resolved) if (e.type === 'AUCTION_RESOLVED') assert.ok(typeof e.revealedBids === 'object');
});
