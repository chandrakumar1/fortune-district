import { test } from 'node:test';
import assert from 'node:assert/strict';

import { botsFor, playersFor, runBatch } from '../src/batch.ts';
import { computeSeatStats } from '../src/seats.ts';
import { runMatch } from '../src/runner.ts';

const RANDOM4 = ['random', 'random', 'random', 'random'] as const;

test('seats: per-seat tallies reconcile with the raw event logs and snapshots', () => {
  const records = runBatch({ matches: 30, players: 4, bots: [...RANDOM4], seed: 5 });
  const n = records.length;
  const stats = computeSeatStats(records);
  assert.equal(stats.length, 4);
  assert.deepEqual(stats.map((s) => s.seat), [1, 2, 3, 4]);
  assert.ok(Math.abs(stats.reduce((a, s) => a + s.winRate, 0) - 1) < 1e-9);

  const total = (k: keyof (typeof stats)[0]) => stats.reduce((a, s) => a + (s[k] as number), 0) * n;
  const count = (type: string) => records.reduce((a, r) => a + r.finalState.eventLog.filter((e) => e.type === type).length, 0);
  assert.ok(Math.abs(total('hubBonuses') - count('HUB_BONUS_PAID')) < 1e-6);
  assert.ok(Math.abs(total('purchasesAtList') - count('PROPERTY_PURCHASED')) < 1e-6);
  assert.ok(Math.abs(total('upgrades') - count('PROPERTY_UPGRADED')) < 1e-6);
  assert.ok(Math.abs(total('leverageReceived') - count('LEVERAGE_TOKEN_GRANTED')) < 1e-6);
  assert.ok(Math.abs(total('leverageUsed') - count('LEVERAGE_TOKEN_USED')) < 1e-6);
  assert.ok(Math.abs(total('propertiesOwnedAtEnd') - records.reduce((a, r) => a + Object.keys(r.finalState.ownership).length, 0)) < 1e-6);
  // Every ₵ of yield paid to a player is received by a player.
  assert.ok(Math.abs(total('yieldPaid') - total('yieldReceived')) < 1e-6);
  // Round-12 mean equals the final mean, and per-round means are the mean of the snapshots by seat.
  for (const s of stats) {
    assert.ok(Math.abs((s.meanNetWorthByRound[12] ?? 0) - s.meanFinalNetWorth) < 1e-6);
    const seatIdx = s.seat - 1;
    const r6 = records.reduce((a, r) => a + (r.netWorthByRound[6]![r.seatOrder[seatIdx]!] ?? 0), 0) / n;
    assert.ok(Math.abs((s.meanNetWorthByRound[6] ?? 0) - r6) < 1e-6);
  }
});

// --- Randomised-seat experiment ---------------------------------------------

test('experiment: the seat assignment is a deterministic function of the seed (engine START_MATCH shuffle)', () => {
  const players = playersFor(4);
  const a = runMatch({ seed: 42, players, bots: botsFor([...RANDOM4], 4, 42) });
  const b = runMatch({ seed: 42, players, bots: botsFor([...RANDOM4], 4, 42) });
  assert.deepEqual(a.seatOrder, b.seatOrder);
  assert.equal(a.finalHash, b.finalHash);
  // The assignment is what the engine announced, and it precedes all gameplay randomness.
  const started = a.finalState.eventLog.find((e) => e.type === 'MATCH_STARTED');
  assert.ok(started && started.type === 'MATCH_STARTED');
  assert.deepEqual([...started.seatOrder], a.seatOrder);
  assert.equal(started.seq, 0);
});

test('experiment: different seeds can produce different seat assignments', () => {
  const players = playersFor(4);
  const orders = new Set<string>();
  for (let seed = 0; seed < 50; seed++) {
    orders.add(runMatch({ seed, players, bots: botsFor([...RANDOM4], 4, seed) }).seatOrder.join(','));
  }
  assert.ok(orders.size > 1, 'expected at least two distinct seat orders across 50 seeds');
  // Every player is dealt to every seat somewhere in a modest batch (24 permutations, 200 seeds).
  const records = runBatch({ matches: 200, players: 4, bots: [...RANDOM4], seed: 1000 });
  for (const id of players.map((p) => p.id)) {
    const seatsSeen = new Set(records.map((r) => r.seatOrder.indexOf(id)));
    assert.deepEqual([...seatsSeen].sort(), [0, 1, 2, 3], `player ${id} should reach every seat`);
  }
});

test('experiment: every player occupies exactly one seat in every match', () => {
  const players = playersFor(4);
  const ids = players.map((p) => p.id).sort();
  const records = runBatch({ matches: 100, players: 4, bots: [...RANDOM4], seed: 77 });
  for (const r of records) {
    assert.equal(r.seatOrder.length, 4);
    assert.deepEqual([...r.seatOrder].sort(), ids);
    assert.deepEqual(r.finalState.players.map((p) => p.seat), [0, 1, 2, 3]);
    assert.deepEqual(r.finalState.players.map((p) => p.id), [...r.seatOrder]);
  }
});

test('experiment: grouping by player does not alter the matches — same hashes, same physical-seat totals, no RNG consumed', () => {
  const opts = { matches: 60, players: 4, bots: [...RANDOM4], seed: 314 } as const;
  const control = runBatch(opts);
  const experiment = runBatch(opts);
  assert.deepEqual(experiment.map((r) => r.finalHash), control.map((r) => r.finalHash));
  assert.deepEqual(experiment.map((r) => r.finalState.rng.counter), control.map((r) => r.finalState.rng.counter));

  const bySeat = computeSeatStats(experiment, 'seat');
  const byPlayer = computeSeatStats(experiment, 'player');
  assert.deepEqual(bySeat, computeSeatStats(control, 'seat'));
  // Both groupings partition the same totals.
  const sum = (stats: typeof bySeat, k: keyof (typeof bySeat)[0]) => stats.reduce((a, s) => a + (s[k] as number), 0);
  for (const k of ['winRate', 'meanFinalNetWorth', 'hubBonuses', 'propertiesOwnedAtEnd', 'leverageReceived', 'yieldPaid'] as const) {
    assert.ok(Math.abs(sum(bySeat, k) - sum(byPlayer, k)) < 1e-6, k);
  }
  assert.deepEqual(byPlayer.map((s) => s.label), ['p1', 'p2', 'p3', 'p4']);
  assert.deepEqual(bySeat.map((s) => s.label), ['seat-1', 'seat-2', 'seat-3', 'seat-4']);
  // The rules are untouched: the fixed constants a match starts from are identical in both batches.
  for (let i = 0; i < control.length; i++) {
    const c = control[i]!.finalState;
    const e = experiment[i]!.finalState;
    assert.equal(c.eventLog.length, e.eventLog.length);
    assert.deepEqual(c.board, e.board);
    assert.deepEqual(c.cityPulse.applied, e.cityPulse.applied);
  }
});
