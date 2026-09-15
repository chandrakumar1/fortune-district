import { test } from 'node:test';
import assert from 'node:assert/strict';

import { replayRecord } from '../src/replay.ts';
import { harness, playToEnd, start } from './harness.ts';

test('replay: seed + players + accepted commands (incl. host timeouts and auction closes) reproduce the live hash and event log', () => {
  const h = harness(['Maya', 'Ravi', 'Lee', 'Ana']);
  start(h);
  // Mix in real timeouts: let a few decisions expire.
  for (let i = 0; i < 3; i++) h.clock.advance(20_000);
  playToEnd(h);
  assert.equal(h.session.roomPhase, 'finished');

  const record = h.session.record()!;
  const types = record.commands.map((c) => c.type);
  assert.equal(types[0], 'START_MATCH');
  assert.ok(types.includes('TURN_TIMED_OUT'), 'host timeouts are in the record');
  assert.ok(types.includes('CLOSE_AUCTION'), 'host auction closes are in the record');
  assert.ok(types.includes('SUBMIT_SEALED_BID'));
  assert.ok(!types.some((t) => ['READY', 'START', 'NO_BID', 'GET_REPLAY'].includes(t)), 'session messages never enter the record');
  assert.equal(record.commands.length, h.session.commandCount);
  assert.deepEqual(Object.keys(record).sort(), ['commands', 'matchId', 'players', 'seed']);

  const replayed = replayRecord(record);
  assert.equal(replayed.commandsApplied, record.commands.length);
  assert.equal(replayed.finalHash, h.session.stateHash());
  assert.deepEqual(replayed.eventLog, h.session.eventLog());
});

test('replay: GET_REPLAY returns the same record to the requester only; the record is a fresh copy', () => {
  const h = harness(['Maya', 'Ravi']);
  start(h);
  playToEnd(h);
  const before = h.sent.length;
  h.session.handle(h.clients['p2']!, { type: 'GET_REPLAY' });
  const msgs = h.sent.slice(before);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0]!.to, 'p2');
  assert.equal(msgs[0]!.message.type, 'REPLAY');
  const rec = (msgs[0]!.message as { record: { commands: unknown[] } }).record;
  assert.deepEqual(rec, h.session.record());
  (rec.commands as unknown[]).length = 0;
  assert.equal(h.session.record()!.commands.length, h.session.commandCount, 'mutating a returned record does not touch the log');
});

test('replay: a record containing a refused command is rejected loudly', () => {
  const h = harness(['Maya', 'Ravi']);
  start(h);
  const rec = h.session.record()!;
  assert.throws(() => replayRecord({ ...rec, commands: [...rec.commands, { type: 'END_TURN', by: 'p9' }] }), /refused/);
});
