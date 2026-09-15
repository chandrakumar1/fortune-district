import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyCommand, projectForPlayer, whoseDecision, legalCommands } from '../src/engine.ts';
import { forwardDistanceToHub } from '../src/auction.ts';
import { actions, active, apply, eventsOf, moveBy, mustFail, own, patchPlayer, player, started, withDice } from './helpers.ts';

function offered(seed = 42) {
  const s = withDice(started(3, seed), [3, 3]); // sum 6 → tile 6: Helix Reactor, T3 ₵260
  const id = active(s);
  return { s: apply(s, { type: 'ADVANCE', by: id }).state, id };
}

test('purchase: buying pays list price to the bank and records price paid', () => {
  const { s, id } = offered();
  assert.equal(eventsOf(s.eventLog, 'PROPERTY_OFFERED').at(-1)!.tileIndex, 6);
  const r = apply(s, { type: 'BUY_PROPERTY', by: id, tileIndex: 6 });
  assert.equal(player(r.state, id).cash, 1200 - 260);
  assert.equal(r.state.ownership[6], id);
  assert.equal(r.state.pricePaid[6], 260);
  assert.equal(r.state.upgrades[6], 0);
  const pay = eventsOf(r.events, 'PAYMENT_MADE')[0]!;
  assert.deepEqual({ to: pay.to, paid: pay.paid, reason: pay.reason }, { to: null, paid: 260, reason: 'purchase' });
  assert.equal(r.state.phase.kind === 'turn' && r.state.phase.step.kind, 'actions');
});

test('purchase: rejected without enough cash or for the wrong tile', () => {
  const { s, id } = offered();
  assert.equal(mustFail(applyCommand(patchPlayer(s, id, { cash: 259 }), { type: 'BUY_PROPERTY', by: id, tileIndex: 6 })), 'INSUFFICIENT_FUNDS');
  assert.equal(mustFail(applyCommand(s, { type: 'BUY_PROPERTY', by: id, tileIndex: 7 })), 'PROPERTY_NOT_AVAILABLE');
});

test('landing on your own property does nothing; landing on an owned property is not offered', () => {
  const s0 = started();
  const id = active(s0);
  const r = moveBy(own(s0, id, 3), 2, 1);
  assert.equal(eventsOf(r.events, 'PROPERTY_OFFERED').length, 0);
  assert.equal(eventsOf(r.events, 'PAYMENT_MADE').length, 0);
  assert.equal(r.state.phase.kind === 'turn' && r.state.phase.step.kind, 'actions');
});

test('decline: opens a sealed auction; everyone including the decliner is eligible; minimum is half price', () => {
  const { s, id } = offered();
  const r = apply(s, { type: 'DECLINE_PROPERTY', by: id, tileIndex: 6 });
  assert.equal(eventsOf(r.events, 'PROPERTY_DECLINED').length, 1);
  const opened = eventsOf(r.events, 'AUCTION_OPENED')[0]!;
  assert.equal(opened.minimumBid, 130);
  assert.equal(opened.origin, 'decline');
  assert.deepEqual([...opened.eligible].sort(), ['a', 'b', 'c']);
  assert.ok(opened.eligible.includes(id));
  assert.equal(r.state.phase.kind, 'auction');
  assert.equal(r.state.auction?.tileIndex, 6);
});

test('auction: bids must be integers ≥ minimum and ≤ cash; one bid per player; only eligible players', () => {
  const { s, id } = offered();
  const a = apply(s, { type: 'DECLINE_PROPERTY', by: id, tileIndex: 6 }).state;
  assert.equal(mustFail(applyCommand(a, { type: 'SUBMIT_SEALED_BID', by: 'a', amount: 129 })), 'INVALID_BID');
  assert.equal(mustFail(applyCommand(a, { type: 'SUBMIT_SEALED_BID', by: 'a', amount: 130.5 })), 'INVALID_BID');
  assert.equal(mustFail(applyCommand(a, { type: 'SUBMIT_SEALED_BID', by: 'a', amount: 1201 })), 'INVALID_BID');
  assert.equal(mustFail(applyCommand(a, { type: 'SUBMIT_SEALED_BID', by: 'host', amount: 130 })), 'NOT_ELIGIBLE_TO_BID');
  const one = apply(a, { type: 'SUBMIT_SEALED_BID', by: 'a', amount: 200 }).state;
  assert.equal(mustFail(applyCommand(one, { type: 'SUBMIT_SEALED_BID', by: 'a', amount: 300 })), 'INVALID_BID');
  // A player in debt bids normally, limited by cash.
  const inDebt = patchPlayer(a, 'b', { debt: 500, cash: 140 });
  assert.equal(mustFail(applyCommand(inDebt, { type: 'SUBMIT_SEALED_BID', by: 'b', amount: 141 })), 'INVALID_BID');
  apply(inDebt, { type: 'SUBMIT_SEALED_BID', by: 'b', amount: 140 });
});

test('auction: highest bid wins, pays the bank, and price paid is the bid', () => {
  const { s, id } = offered();
  const a = apply(s, { type: 'DECLINE_PROPERTY', by: id, tileIndex: 6 }).state;
  const r = apply(
    a,
    { type: 'SUBMIT_SEALED_BID', by: 'a', amount: 130 },
    { type: 'SUBMIT_SEALED_BID', by: 'b', amount: 300 },
    { type: 'SUBMIT_SEALED_BID', by: 'c', amount: 250 },
    { type: 'CLOSE_AUCTION', by: 'host' },
  );
  const res = eventsOf(r.events, 'AUCTION_RESOLVED')[0]!;
  assert.deepEqual({ winner: res.winner, bid: res.winningBid, tie: res.tieBroken }, { winner: 'b', bid: 300, tie: false });
  assert.deepEqual(res.revealedBids, { a: 130, b: 300, c: 250 });
  assert.equal(r.state.ownership[6], 'b');
  assert.equal(r.state.pricePaid[6], 300);
  assert.equal(player(r.state, 'b').cash, 900);
  assert.equal(player(r.state, 'a').cash, 1200);
  // Returns to the decliner's action window.
  assert.deepEqual(r.state.phase, { kind: 'turn', activePlayer: id, step: { kind: 'actions', upgradesThisTurn: 0, exchangeDiscount: false, pulseRelayAvailable: false } });
  assert.equal(r.state.auction, null);
});

test('auction: nobody bids → property stays unowned', () => {
  const { s, id } = offered();
  const a = apply(s, { type: 'DECLINE_PROPERTY', by: id, tileIndex: 6 }).state;
  const r = apply(a, { type: 'CLOSE_AUCTION', by: 'host' });
  const res = eventsOf(r.events, 'AUCTION_RESOLVED')[0]!;
  assert.equal(res.winner, null);
  assert.equal(r.state.ownership[6], undefined);
});

test('auction: equal highest bids go to the bidder furthest from the Hub (greatest forward distance); no RNG consumed', () => {
  const { s, id } = offered();
  const a = apply(s, { type: 'DECLINE_PROPERTY', by: id, tileIndex: 6 }).state;
  // Forward distance to tile 0: position 1 → 23 (furthest), position 23 → 1, position 0 → 0.
  assert.equal(forwardDistanceToHub(1), 23);
  assert.equal(forwardDistanceToHub(23), 1);
  assert.equal(forwardDistanceToHub(0), 0);
  assert.equal(forwardDistanceToHub(12), 12);

  const placed = patchPlayer(patchPlayer(patchPlayer(a, 'a', { position: 23 }), 'b', { position: 1 }), 'c', { position: 12 });
  const r = apply(
    placed,
    { type: 'SUBMIT_SEALED_BID', by: 'a', amount: 200 },
    { type: 'SUBMIT_SEALED_BID', by: 'b', amount: 200 },
    { type: 'SUBMIT_SEALED_BID', by: 'c', amount: 200 },
    { type: 'CLOSE_AUCTION', by: 'host' },
  );
  const e = eventsOf(r.events, 'AUCTION_RESOLVED')[0]!;
  assert.deepEqual({ winner: e.winner, tie: e.tieBroken }, { winner: 'b', tie: true });
  assert.equal(r.state.rng.counter, placed.rng.counter, 'tie-break must not consume the RNG');
  // A player standing on the Hub (distance 0) never wins a tie against anyone off it.
  const onHub = patchPlayer(patchPlayer(a, 'a', { position: 0 }), 'b', { position: 22 });
  const r2 = apply(onHub, { type: 'SUBMIT_SEALED_BID', by: 'a', amount: 150 }, { type: 'SUBMIT_SEALED_BID', by: 'b', amount: 150 }, { type: 'CLOSE_AUCTION', by: 'host' });
  assert.equal(eventsOf(r2.events, 'AUCTION_RESOLVED')[0]!.winner, 'b');
});

test('auction: tied bidders on the same tile are separated by seat order (lower seat wins)', () => {
  const { s, id } = offered();
  const a = apply(s, { type: 'DECLINE_PROPERTY', by: id, tileIndex: 6 }).state;
  const seats = a.players.map((p) => p.id); // seat order
  const sameTile = seats.reduce((st, pid) => patchPlayer(st, pid, { position: 5 }), a);
  const r = apply(
    sameTile,
    { type: 'SUBMIT_SEALED_BID', by: seats[2]!, amount: 180 },
    { type: 'SUBMIT_SEALED_BID', by: seats[1]!, amount: 180 },
    { type: 'CLOSE_AUCTION', by: 'host' },
  );
  const e = eventsOf(r.events, 'AUCTION_RESOLVED')[0]!;
  assert.deepEqual({ winner: e.winner, tie: e.tieBroken }, { winner: seats[1], tie: true });
  // Furthest wins even if it is the higher seat.
  const mixed = patchPlayer(patchPlayer(a, seats[0]!, { position: 20 }), seats[2]!, { position: 3 });
  const r2 = apply(mixed, { type: 'SUBMIT_SEALED_BID', by: seats[0]!, amount: 140 }, { type: 'SUBMIT_SEALED_BID', by: seats[2]!, amount: 140 }, { type: 'CLOSE_AUCTION', by: 'host' });
  assert.equal(eventsOf(r2.events, 'AUCTION_RESOLVED')[0]!.winner, seats[2]);
});

test('auction: the host may only close; CLOSE_AUCTION outside an auction is rejected', () => {
  const { s, id } = offered();
  const a = apply(s, { type: 'DECLINE_PROPERTY', by: id, tileIndex: 6 }).state;
  assert.equal(mustFail(applyCommand(a, { type: 'CLOSE_AUCTION', by: 'a' })), 'NOT_YOUR_TURN');
  assert.equal(mustFail(applyCommand(actions(started()), { type: 'CLOSE_AUCTION', by: 'host' })), 'WRONG_PHASE');
  assert.equal(mustFail(applyCommand(a, { type: 'END_TURN', by: id })), 'WRONG_PHASE');
});

test('auction: projectForPlayer hides other players\' sealed bids and the rng', () => {
  const { s, id } = offered();
  const a = apply(s, { type: 'DECLINE_PROPERTY', by: id, tileIndex: 6 }, { type: 'SUBMIT_SEALED_BID', by: 'a', amount: 150 }).state;
  const viewA = projectForPlayer(a, 'a');
  const viewB = projectForPlayer(a, 'b');
  assert.equal(viewA.state.auction?.myBid, 150);
  assert.equal(viewB.state.auction?.myBid, null);
  assert.ok(!('bids' in (viewB.state.auction as object)));
  assert.ok(!('rng' in viewB.state));
  // Public BID_RECEIVED carries the bidder only.
  const bid = eventsOf(a.eventLog, 'BID_RECEIVED')[0]!;
  assert.deepEqual(Object.keys(bid).sort(), ['bidder', 'round', 'seq', 'type']);
});

test('auction: whoseDecision walks eligible bidders who can afford the minimum, then the host', () => {
  const { s, id } = offered();
  const a = patchPlayer(apply(s, { type: 'DECLINE_PROPERTY', by: id, tileIndex: 6 }).state, 'b', { cash: 100 });
  const order = a.players.map((p) => p.id).filter((p) => p !== 'b');
  assert.equal(whoseDecision(a), order[0]);
  assert.deepEqual(legalCommands(a, 'b'), []);
  const one = apply(a, { type: 'SUBMIT_SEALED_BID', by: order[0]!, amount: 130 }).state;
  assert.equal(whoseDecision(one), order[1]);
  const two = apply(one, { type: 'SUBMIT_SEALED_BID', by: order[1]!, amount: 130 }).state;
  assert.equal(whoseDecision(two), 'host');
});
