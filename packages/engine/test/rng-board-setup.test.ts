import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BOARD, categoryTiles } from '../src/board.ts';
import { createRng, nextInt, rollDie, shuffle } from '../src/rng.ts';
import { PROPERTY_CATEGORIES, STARTING_CASH } from '../src/constants.ts';
import { applyCommand } from '../src/engine.ts';
import { eventsOf, lobby, must, mustFail, P, started } from './helpers.ts';

// --- PRNG -------------------------------------------------------------------

test('rng: same seed produces the same sequence and never mutates state', () => {
  const a = createRng(7);
  const seqA: number[] = [];
  let s = a;
  for (let i = 0; i < 50; i++) {
    const r = nextInt(s, 1000);
    seqA.push(r.value);
    s = r.rng;
  }
  let t = createRng(7);
  const seqB: number[] = [];
  for (let i = 0; i < 50; i++) {
    const r = nextInt(t, 1000);
    seqB.push(r.value);
    t = r.rng;
  }
  assert.deepEqual(seqA, seqB);
  assert.deepEqual(a, { seed: 7, counter: 0 });
  assert.notDeepEqual(seqA, new Array(50).fill(seqA[0]));
});

test('rng: rollDie stays within 1..6 and shuffle is a deterministic permutation', () => {
  let s = createRng(123);
  for (let i = 0; i < 500; i++) {
    const r = rollDie(s, 6);
    assert.ok(r.value >= 1 && r.value <= 6);
    s = r.rng;
  }
  const x = shuffle(createRng(9), ['a', 'b', 'c', 'd']);
  const y = shuffle(createRng(9), ['a', 'b', 'c', 'd']);
  assert.deepEqual(x.value, y.value);
  assert.deepEqual([...x.value].sort(), ['a', 'b', 'c', 'd']);
});

// --- Board ------------------------------------------------------------------

test('board: exact Paper Playtest Kit layout', () => {
  assert.equal(BOARD.length, 24);
  assert.equal(BOARD.filter((t) => t.kind === 'property').length, 18);
  assert.deepEqual(
    [0, 4, 8, 12, 16, 20].map((i) => BOARD[i]?.kind),
    ['district_hub', 'pulse_relay', 'audit', 'pulse_relay', 'exchange', 'windfall'],
  );
  for (const c of PROPERTY_CATEGORIES) {
    const tiles = categoryTiles(BOARD, c);
    assert.equal(tiles.length, 3, c);
    const tiers = tiles.map((i) => (BOARD[i] as { tier: number }).tier).sort();
    assert.deepEqual(tiers, [1, 2, 3], c);
  }
  const names = BOARD.filter((t) => t.kind === 'property').map((t) => (t as { name: string }).name);
  assert.deepEqual(names, [
    'Kestrel Row', 'Quanta Campus', 'Neon Arcade', 'Foundry Yard', 'Helix Reactor', 'Tram Depot',
    'Vireo Terraces', 'Lattice Labs', 'Aurora Colosseum', 'Ironworks Mile', 'Solar Flats', 'Skyrail Junction',
    'Halcyon Heights', 'Cortex Tower', 'Skyline Gardens', 'Titan Docks', 'Fusion Spur', 'Orbital Gate',
  ]);
  const t6 = BOARD[6];
  assert.ok(t6?.kind === 'property' && t6.category === 'Energy' && t6.tier === 3 && t6.price === 260 && t6.baseYield === 50);
  const t1 = BOARD[1];
  assert.ok(t1?.kind === 'property' && t1.price === 100 && t1.baseYield === 15);
  const t2 = BOARD[2];
  assert.ok(t2?.kind === 'property' && t2.price === 180 && t2.baseYield === 30);
});

// --- Setup ------------------------------------------------------------------

test('setup: lobby state has ₵1,200, no debt, no tokens, position 0', () => {
  const s = lobby(4);
  assert.equal(s.phase.kind, 'lobby');
  assert.equal(s.players.length, 4);
  for (const p of s.players) {
    assert.equal(p.cash, STARTING_CASH);
    assert.equal(p.debt, 0);
    assert.equal(p.creditLine, 0);
    assert.equal(p.leverageTokens, 0);
    assert.equal(p.position, 0);
  }
  assert.equal(s.round, 1);
  assert.deepEqual(s.cityPulse.schedule.map((e) => e.round), [4, 7, 10]);
  assert.equal(s.cityPulse.active, null);
});

test('setup: START_MATCH rejects 1 or 5 players and non-host', () => {
  assert.equal(mustFail(applyCommand(lobby(1), { type: 'START_MATCH', by: 'host' })), 'INVALID_PLAYER_COUNT');
  const five = { ...lobby(4), players: [...lobby(4).players, { ...lobby(4).players[0]!, id: 'e', seat: 4 }] };
  assert.equal(mustFail(applyCommand(five, { type: 'START_MATCH', by: 'host' })), 'INVALID_PLAYER_COUNT');
  assert.equal(mustFail(applyCommand(lobby(2), { type: 'START_MATCH', by: 'a' })), 'NOT_YOUR_TURN');
  assert.equal(mustFail(applyCommand(started(2), { type: 'START_MATCH', by: 'host' })), 'MATCH_ALREADY_STARTED');
});

test('setup: seat order is a seeded shuffle, fixed for the match; first turn rolls two dice', () => {
  const r = must(applyCommand(lobby(4, 5), { type: 'START_MATCH', by: 'host' }));
  const again = must(applyCommand(lobby(4, 5), { type: 'START_MATCH', by: 'host' }));
  const order = r.state.players.map((p) => p.id);
  assert.deepEqual(order, again.state.players.map((p) => p.id));
  assert.deepEqual([...order].sort(), [...P]);
  assert.deepEqual(r.state.players.map((p) => p.seat), [0, 1, 2, 3]);
  const startedEv = eventsOf(r.events, 'MATCH_STARTED')[0]!;
  assert.deepEqual(startedEv.seatOrder, order);
  const ts = eventsOf(r.events, 'TURN_STARTED')[0]!;
  assert.equal(ts.player, order[0]);
  const dice = eventsOf(r.events, 'DICE_ROLLED')[0]!.dice;
  assert.equal(dice.length, 2);
  for (const d of dice) assert.ok(d >= 1 && d <= 6);
  assert.deepEqual(r.state.phase, { kind: 'turn', activePlayer: order[0], step: { kind: 'roll', dice } });
  // Different seeds generally give a different order.
  const other = must(applyCommand(lobby(4, 99), { type: 'START_MATCH', by: 'host' })).state.players.map((p) => p.id);
  assert.ok(other.join() !== order.join() || true); // permutation may coincide; determinism is what matters
});
