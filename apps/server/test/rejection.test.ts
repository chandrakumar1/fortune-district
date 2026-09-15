import { test } from 'node:test';
import assert from 'node:assert/strict';

import { harness, legalFor, sendCommand, start } from './harness.ts';
import type { Harness } from './harness.ts';

function snapshot(h: Harness) {
  return { hash: h.session.stateHash(), commands: h.session.commandCount, deadline: JSON.stringify(h.session.deadline), epoch: h.session.epoch, applied: h.applied, sent: h.sent.length };
}

test('rejection: an illegal command → REJECTED to the sender only; state hash, commandLog, deadline and epoch unchanged; no envelope emitted', () => {
  const h = harness(['Maya', 'Ravi', 'Lee']);
  start(h);
  const s = h.state()!;
  const active = s.phase.kind === 'turn' ? s.phase.activePlayer : '';
  const other = ['p1', 'p2', 'p3'].find((p) => p !== active)!;
  const before = snapshot(h);

  // Wrong player.
  h.session.handle(h.clients[other]!, { type: 'COMMAND', command: { type: 'ADVANCE' } });
  // Wrong phase for the active player.
  h.session.handle(h.clients[active]!, { type: 'COMMAND', command: { type: 'END_TURN' } });
  // Bid outside an auction.
  h.session.handle(h.clients[active]!, { type: 'COMMAND', command: { type: 'SUBMIT_SEALED_BID', amount: 50 } });
  // Spoofed `by`: the session stamps the real sender, so the engine sees `other`, not `active`.
  h.session.handle(h.clients[other]!, { type: 'COMMAND', command: { type: 'ADVANCE', by: active } });
  // Host-only types from a client.
  for (const type of ['START_MATCH', 'TURN_TIMED_OUT', 'CLOSE_AUCTION']) h.session.handle(h.clients[active]!, { type: 'COMMAND', command: { type, by: 'host' } });
  // Malformed.
  h.session.handle(h.clients[active]!, { type: 'COMMAND', command: { type: 'BUY_PROPERTY', tileIndex: 'x' } });
  h.session.handle(h.clients[active]!, { type: 'NONSENSE' });
  h.session.handle(h.clients[active]!, 42);

  const after = snapshot(h);
  assert.equal(after.hash, before.hash, 'GameState untouched');
  assert.equal(after.commands, before.commands, 'commandLog untouched');
  assert.equal(after.deadline, before.deadline, 'deadline untouched');
  assert.equal(after.epoch, before.epoch, 'timer epoch untouched');
  assert.equal(after.applied, before.applied, 'the reducer produced no accepted result');
  const newMessages = h.sent.slice(before.sent);
  assert.equal(newMessages.length, 10, 'exactly one reply per refused message');
  assert.ok(newMessages.every((m) => m.message.type === 'REJECTED'), 'no VIEW envelopes were emitted');
  assert.ok(newMessages.every((m) => m.to === active || m.to === other));
  const codes = newMessages.map((m) => (m.message as { code: string }).code);
  assert.deepEqual(codes, ['NOT_YOUR_TURN', 'WRONG_PHASE', 'WRONG_PHASE', 'NOT_YOUR_TURN', 'HOST_ONLY', 'HOST_ONLY', 'HOST_ONLY', 'MALFORMED', 'MALFORMED', 'MALFORMED']);
  assert.ok(newMessages.slice(0, 2).every((m) => m.to !== (m.to === active ? other : active)), 'each reply goes to its own sender');
});

test('rejection: an over-cash sealed bid is refused by the engine and leaves the auction untouched', () => {
  const h = harness(['Maya', 'Ravi']);
  start(h);
  for (let i = 0; i < 300 && h.state()!.phase.kind !== 'auction'; i++) {
    const s = h.state()!;
    if (s.phase.kind !== 'turn') break;
    const p = s.phase.activePlayer;
    const legal = legalFor(h, p);
    sendCommand(h, p, legal.find((c) => c.type === 'ADVANCE') ?? legal.find((c) => c.type === 'DECLINE_PROPERTY') ?? legal.find((c) => c.type === 'END_TURN')!);
  }
  assert.equal(h.state()!.phase.kind, 'auction');
  const bidder = h.state()!.auction!.eligible[0]!;
  const cash = h.state()!.players.find((p) => p.id === bidder)!.cash;
  const before = snapshot(h);
  h.session.handle(h.clients[bidder]!, { type: 'COMMAND', command: { type: 'SUBMIT_SEALED_BID', amount: cash + 1 } });
  const after = snapshot(h);
  assert.equal(after.hash, before.hash);
  assert.equal(after.epoch, before.epoch);
  assert.equal((h.sent.at(-1)!.message as { code: string }).code, 'INVALID_BID');
  assert.equal(h.state()!.auction!.bids[bidder], undefined);
});
