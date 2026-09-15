import { test } from 'node:test';
import assert from 'node:assert/strict';

import { harness, readyAll, start } from './harness.ts';

test('lobby: seats p1..p4 in join order, first joiner is creator, fifth join is refused', () => {
  const h = harness(['Maya', 'Ravi', 'Lee', 'Ana']);
  assert.deepEqual(Object.keys(h.clients), ['p1', 'p2', 'p3', 'p4']);
  assert.equal(h.session.creator, 'p1');
  assert.deepEqual(h.session.join('c5', 'Zed'), { ok: false, reason: 'FULL' });
  const view = h.lastView('p4')!;
  assert.equal(view.playerView, null, 'no PlayerView before START');
  assert.equal(view.presence.phase, 'lobby');
  assert.equal(view.deadline, null);
  assert.deepEqual(Object.keys(view.presence.players), ['p1', 'p2', 'p3', 'p4']);
});

test('lobby: START refused unless creator, ≥2 players and everyone ready; then START_MATCH is command #1', () => {
  const h = harness(['Maya']);
  h.session.handle('c1', { type: 'START' });
  assert.equal(h.rejections('p1').at(-1)?.message.type === 'REJECTED' && (h.rejections('p1').at(-1)!.message as { code: string }).code, 'NOT_READY');

  const r = h.session.join('c2', 'Ravi');
  assert.ok(r.ok);
  h.clients['p2'] = 'c2';
  h.session.handle('c2', { type: 'START' });
  assert.equal((h.rejections('p2').at(-1)!.message as { code: string }).code, 'NOT_CREATOR');

  h.session.handle('c1', { type: 'READY', ready: true });
  h.session.handle('c1', { type: 'START' });
  assert.equal((h.rejections('p1').at(-1)!.message as { code: string; message: string }).code, 'NOT_READY');
  assert.ok((h.rejections('p1').at(-1)!.message as { message: string }).message.includes('Ravi'));
  assert.equal(h.session.roomPhase, 'lobby');

  readyAll(h);
  h.session.handle('c1', { type: 'START' });
  assert.equal(h.session.roomPhase, 'playing');
  assert.equal(h.session.commandCount, 1);
  assert.equal(h.session.record()!.commands[0]!.type, 'START_MATCH');
  assert.equal(h.applied, 1);
  const view = h.lastView('p2')!;
  assert.ok(view.playerView && view.playerView.viewer === 'p2');
  assert.equal(view.presence.phase, 'playing');
  assert.equal(view.deadline?.kind, 'turn');

  // Lobby messages after start are refused; a second START too.
  h.session.handle('c1', { type: 'READY', ready: false });
  assert.equal((h.rejections('p1').at(-1)!.message as { code: string }).code, 'WRONG_ROOM_PHASE');
  h.session.handle('c1', { type: 'START' });
  assert.equal((h.rejections('p1').at(-1)!.message as { code: string }).code, 'WRONG_ROOM_PHASE');
  assert.equal(h.session.commandCount, 1);
});

test('lobby: leaving frees the seat, un-readies, reassigns creator to the earliest seated; joins are refused once playing', () => {
  const h = harness(['Maya', 'Ravi', 'Lee']);
  h.session.handle('c1', { type: 'READY', ready: true });
  h.session.leave('c1');
  assert.equal(h.session.creator, 'p2');
  assert.deepEqual(h.session.seats.map((s) => s.playerId), ['p2', 'p3']);
  const again = h.session.join('c9', 'Maya2');
  assert.ok(again.ok && again.playerId === 'p1', 'the lowest free seat id is reused');
  assert.equal(h.lastView('p1')!.presence.players['p1']!.ready, false);
  // Ready-all and start under the new creator.
  for (const c of ['c9', 'c2', 'c3']) h.session.handle(c, { type: 'READY', ready: true });
  h.session.handle('c2', { type: 'START' });
  assert.equal(h.session.roomPhase, 'playing');
  assert.deepEqual(h.session.join('c10', 'Late'), { ok: false, reason: 'NOT_IN_LOBBY' });
});

test('lobby: a full four-player match starts and its config lists the seated players', () => {
  const h = harness(['Maya', 'Ravi', 'Lee', 'Ana']);
  start(h);
  const rec = h.session.record()!;
  assert.equal(rec.seed, 4242);
  assert.deepEqual(rec.players.map((p) => p.id), ['p1', 'p2', 'p3', 'p4']);
});
