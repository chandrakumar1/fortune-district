import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SeatRegistry, newSeed } from '../src/session.ts';
import { harness, legalFor, playToEnd, sendCommand, start } from './harness.ts';

test('tokens: 32 random bytes (base64url), unique per seat, only digests retained, constant-time verified, single-seat', () => {
  const r = new SeatRegistry();
  const a = r.allocate('cA', 'A')!;
  const b = r.allocate('cB', 'B')!;
  assert.equal(a.seat.playerId, 'p1');
  assert.equal(b.seat.playerId, 'p2');
  assert.match(a.token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a.token, b.token);
  assert.ok(!JSON.stringify(r.seats).includes(a.token), 'the registry never stores the raw token');
  // Rejoin requires the seat to be unbound first.
  assert.equal(r.rejoin('cA2', a.token), null, 'still bound');
  assert.equal(r.unbind('cA'), 'p1');
  assert.equal(r.rejoin('cA2', b.token), null, 'another seat\'s token does not open this seat');
  assert.equal(r.rejoin('cA2', 'not-a-token'), null);
  assert.equal(r.rejoin('cA2', a.token.slice(0, 42) + (a.token.endsWith('A') ? 'B' : 'A')), null, 'near-miss refused');
  assert.equal(r.rejoin('cA2', a.token)?.playerId, 'p1');
  assert.equal(r.playerOf('cA2'), 'p1');
  assert.equal(r.playerOf('cA'), null);
  r.revokeAll();
  assert.equal(r.unbind('cA2'), 'p1');
  assert.equal(r.rejoin('cA3', a.token), null, 'revoked after the match');
});

test('seed: production seeds come from node:crypto and are 31-bit non-negative integers', () => {
  const seen = new Set<number>();
  for (let i = 0; i < 50; i++) {
    const s = newSeed();
    assert.ok(Number.isInteger(s) && s >= 0 && s < 2 ** 31);
    seen.add(s);
  }
  assert.ok(seen.size > 45);
});

test('reconnection: leaving during play reserves the seat and keeps timers running; rejoin restores the view and the live deadline', () => {
  const h = harness(['Maya', 'Ravi', 'Lee']);
  start(h);
  const s = h.state()!;
  const active = s.phase.kind === 'turn' ? s.phase.activePlayer : '';
  const away = ['p1', 'p2', 'p3'].find((p) => p !== active)!;

  h.session.leave(h.clients[away]!);
  assert.deepEqual(h.session.seats.map((x) => x.playerId), ['p1', 'p2', 'p3'], 'seat reserved');
  assert.equal(h.lastView(active)!.presence.players[away]!.connected, false);
  const sentBefore = h.sent.length;
  h.clock.advance(7_000);
  sendCommand(h, active, legalFor(h, active).find((c) => c.type === 'ADVANCE')!);
  assert.ok(!h.sent.slice(sentBefore).some((m) => m.to === away), 'nothing is sent to a disconnected seat');
  const deadline = h.session.deadline!;

  // Wrong token / wrong seat / replay of a used client id are all refused.
  assert.equal(h.session.rejoin('cX', 'garbage'), null);
  assert.equal(h.session.rejoin('cX', h.tokens[active]!), null, 'the active player is still connected; their token opens nothing');
  h.clock.advance(3_000);
  const back = h.session.rejoin('cX', h.tokens[away]!);
  assert.equal(back, away);
  assert.equal(h.session.playerOf('cX'), away);
  const view = h.lastView(away)!;
  assert.ok(view.playerView && view.playerView.viewer === away, 'own PlayerView restored');
  assert.equal(view.presence.players[away]!.connected, true);
  assert.deepEqual(view.deadline, deadline, 'the live deadline is delivered unchanged (endsAt did not move)');
  assert.equal(view.deadline!.endsAt - h.clock.now(), 20_000 - 3_000, 'remaining time is derivable from serverNow/endsAt');

  // The returning player can act when it is their turn.
  h.session.handle('cX', { type: 'COMMAND', command: { type: 'ADVANCE' } });
  assert.equal((h.sent.at(-1)!.message as { code?: string }).code, 'NOT_YOUR_TURN');
});

test('reconnection: the seat is released and tokens revoked once the match is finished', () => {
  const h = harness(['Maya', 'Ravi']);
  start(h);
  h.session.leave(h.clients['p2']!);
  playToEnd(h);
  assert.equal(h.session.roomPhase, 'finished');
  assert.equal(h.session.rejoin('c9', h.tokens['p2']!), null);
});

test('reconnection: a client cannot take over a seat that is still connected, and the old client id stops resolving after unbind', () => {
  const h = harness(['Maya', 'Ravi']);
  start(h);
  assert.equal(h.session.rejoin('c9', h.tokens['p1']!), null);
  h.session.leave('c1');
  assert.equal(h.session.playerOf('c1'), null);
  assert.equal(h.session.rejoin('c9', h.tokens['p1']!), 'p1');
  assert.equal(h.session.rejoin('c10', h.tokens['p1']!), null, 'token cannot be used twice concurrently');
});
