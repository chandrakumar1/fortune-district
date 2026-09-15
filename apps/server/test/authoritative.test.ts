import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyCommand, hashState } from '../src/engine.ts';
import type { GameState } from '../src/engine.ts';
import { harness, playToEnd, start } from './harness.ts';

test('authoritative: every state change is one accepted applyCommand; the reducer is called once per submitted command; refused calls change nothing', () => {
  const h = harness(['Maya', 'Ravi', 'Lee']);
  let calls = 0;
  let refused = 0;
  let last: GameState | null = null;
  const seen: string[] = [];
  const counting = (state: GameState, command: Parameters<typeof applyCommand>[1]) => {
    calls++;
    if (last !== null) assert.equal(hashState(state), hashState(last), 'the reducer always receives the state it last produced');
    const r = applyCommand(state, command);
    if (r.ok) {
      last = r.state;
      seen.push(hashState(r.state));
    } else refused++;
    return r;
  };
  // Re-create the session with the counting reducer (harness wraps it again for state capture).
  const h2 = harness(['Maya', 'Ravi', 'Lee'], { applyCommand: counting });
  void h;
  start(h2);
  // A couple of illegal commands.
  h2.session.handle(h2.clients['p1']!, { type: 'COMMAND', command: { type: 'END_TURN' } });
  h2.session.handle(h2.clients['p2']!, { type: 'COMMAND', command: { type: 'END_TURN' } });
  playToEnd(h2);
  assert.equal(h2.session.roomPhase, 'finished');
  assert.equal(seen.length, h2.session.commandCount, 'accepted reducer results == commandLog length');
  assert.equal(calls, seen.length + refused, 'no other path produced a state');
  assert.ok(refused >= 1);
  assert.equal(h2.session.stateHash(), seen.at(-1), 'the session state is exactly the last accepted reducer output');
});

test('authoritative: PlayerState.connected is never written by the server (presence lives outside GameState)', () => {
  const h = harness(['Maya', 'Ravi']);
  start(h);
  const initial = h.state()!.players.map((p) => p.connected);
  h.session.leave(h.clients['p1']!);
  h.session.rejoin('c9', h.tokens['p1']!);
  playToEnd(h);
  assert.deepEqual(h.state()!.players.map((p) => p.connected), initial, 'engine field untouched across disconnect/rejoin');
});

test('authoritative: session metadata (presence, ready, deadline, NO_BID, tokens) is absent from GameState and from the replay record', () => {
  const h = harness(['Maya', 'Ravi', 'Lee']);
  start(h);
  playToEnd(h);
  const stateText = JSON.stringify(h.state());
  for (const word of ['presence', 'ready', 'deadline', 'noBid', 'token', 'rejoin', 'endsAt', 'creator']) assert.ok(!stateText.includes(`"${word}"`), `${word} in GameState`);
  const recText = JSON.stringify(h.session.record());
  for (const word of ['presence', 'ready', 'deadline', 'NO_BID', 'token', 'endsAt', 'creator', 'connected']) assert.ok(!recText.includes(word), `${word} in replay record`);
});
