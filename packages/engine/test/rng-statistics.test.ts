/**
 * Statistical checks on the dice RNG over large samples.
 *
 * Thresholds are chi-square critical values at p = 0.001, so a correct
 * generator fails a given check about once in a thousand runs — and since the
 * generator is deterministic for a fixed seed, a passing run passes forever.
 *   df = 5  → 20.515   (one die, six faces)
 *   df = 35 → 66.619   (pairs of dice, 36 cells)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRng, nextInt, rawDraw, rollDie, rollTwoDice } from '../src/rng.ts';
import { DIE_SIDES } from '../src/constants.ts';

const CHI2_DF5_P001 = 20.515;
const CHI2_DF35_P001 = 66.619;

function chiSquare(counts: readonly number[], expected: number): number {
  return counts.reduce((sum, c) => sum + ((c - expected) * (c - expected)) / expected, 0);
}

function sampleDice(seed: number, turns: number): { first: number[]; second: number[] } {
  const first: number[] = new Array(turns);
  const second: number[] = new Array(turns);
  let rng = createRng(seed);
  for (let i = 0; i < turns; i++) {
    const r = rollTwoDice(rng, DIE_SIDES);
    rng = r.rng;
    first[i] = r.dice[0];
    second[i] = r.dice[1];
  }
  return { first, second };
}

function faceCounts(values: readonly number[]): number[] {
  const counts = new Array<number>(DIE_SIDES).fill(0);
  for (const v of values) counts[v - 1] = (counts[v - 1] ?? 0) + 1;
  return counts;
}

const TURNS = 300_000; // 600,000 dice per seed

test('dice: every value is an integer in 1..6', () => {
  const { first, second } = sampleDice(1, 50_000);
  for (const v of [...first, ...second]) assert.ok(Number.isInteger(v) && v >= 1 && v <= DIE_SIDES, `bad die ${v}`);
});

test('dice: each die position is approximately uniform over 1..6 (chi-square, p = 0.001)', () => {
  for (const seed of [42, 7, 2026]) {
    const { first, second } = sampleDice(seed, TURNS);
    const c1 = chiSquare(faceCounts(first), TURNS / DIE_SIDES);
    const c2 = chiSquare(faceCounts(second), TURNS / DIE_SIDES);
    assert.ok(c1 < CHI2_DF5_P001, `seed ${seed} first die chi² ${c1.toFixed(2)}`);
    assert.ok(c2 < CHI2_DF5_P001, `seed ${seed} second die chi² ${c2.toFixed(2)}`);
  }
});

test('dice: the two dice of a turn are independent (36-cell chi-square, p = 0.001)', () => {
  for (const seed of [42, 7, 2026]) {
    const { first, second } = sampleDice(seed, TURNS);
    const cells = new Array<number>(36).fill(0);
    for (let i = 0; i < TURNS; i++) cells[(first[i]! - 1) * 6 + (second[i]! - 1)]++;
    const chi = chiSquare(cells, TURNS / 36);
    assert.ok(chi < CHI2_DF35_P001, `seed ${seed} pair chi² ${chi.toFixed(2)}`);
    // Equal-dice rate ≈ 1/6.
    let doubles = 0;
    for (let i = 0; i < TURNS; i++) if (first[i] === second[i]) doubles++;
    assert.ok(Math.abs(doubles / TURNS - 1 / 6) < 0.005, `doubles rate ${(doubles / TURNS).toFixed(4)}`);
  }
});

test('dice: consecutive turns are independent (lag-1 serial chi-square across the roll stream)', () => {
  const { first, second } = sampleDice(99, TURNS);
  // Interleave into the actual draw order and test each value against the next.
  const stream: number[] = new Array(TURNS * 2);
  for (let i = 0; i < TURNS; i++) {
    stream[2 * i] = first[i]!;
    stream[2 * i + 1] = second[i]!;
  }
  for (const lag of [1, 2, 3]) {
    const cells = new Array<number>(36).fill(0);
    const n = stream.length - lag;
    for (let i = 0; i < n; i++) cells[(stream[i]! - 1) * 6 + (stream[i + lag]! - 1)]++;
    const chi = chiSquare(cells, n / 36);
    assert.ok(chi < CHI2_DF35_P001, `lag ${lag} chi² ${chi.toFixed(2)}`);
  }
});

test('dice: the movement sum 2..12 follows the triangular distribution k/36 (chi-square, df 10 < 29.588 at p = 0.001)', () => {
  const { first, second } = sampleDice(2027, TURNS);
  const counts = new Array<number>(13).fill(0);
  for (let i = 0; i < TURNS; i++) counts[first[i]! + second[i]!]++;
  let chi = 0;
  for (let sum = 2; sum <= 12; sum++) {
    const ways = 6 - Math.abs(sum - 7);
    const expected = (TURNS * ways) / 36;
    chi += ((counts[sum]! - expected) ** 2) / expected;
  }
  assert.ok(chi < 29.588, `sum chi² ${chi.toFixed(2)}`);
  assert.equal(counts[0]! + counts[1]!, 0);
  const meanSum = first.reduce((a, b, i) => a + b + second[i]!, 0) / TURNS;
  assert.ok(Math.abs(meanSum - 7) < 0.02, `mean sum ${meanSum}`);
});

test('dice: mean ≈ 3.5 and variance ≈ 35/12', () => {
  const { first, second } = sampleDice(5, TURNS);
  const all = [...first, ...second];
  const mean = all.reduce((a, b) => a + b, 0) / all.length;
  const variance = all.reduce((a, b) => a + (b - mean) * (b - mean), 0) / all.length;
  assert.ok(Math.abs(mean - 3.5) < 0.01, `mean ${mean}`);
  assert.ok(Math.abs(variance - 35 / 12) < 0.03, `variance ${variance}`);
});

test('dice: the first roll of a match is uniform across seeds (nearby seeds are decorrelated)', () => {
  const SEEDS = 60_000;
  const c1 = new Array<number>(DIE_SIDES).fill(0);
  const c2 = new Array<number>(DIE_SIDES).fill(0);
  const pairs = new Array<number>(36).fill(0);
  for (let seed = 0; seed < SEEDS; seed++) {
    const r = rollTwoDice(createRng(seed), DIE_SIDES);
    c1[r.dice[0] - 1]++;
    c2[r.dice[1] - 1]++;
    pairs[(r.dice[0] - 1) * 6 + (r.dice[1] - 1)]++;
  }
  assert.ok(chiSquare(c1, SEEDS / DIE_SIDES) < CHI2_DF5_P001, `first die over seeds ${chiSquare(c1, SEEDS / DIE_SIDES).toFixed(2)}`);
  assert.ok(chiSquare(c2, SEEDS / DIE_SIDES) < CHI2_DF5_P001, `second die over seeds ${chiSquare(c2, SEEDS / DIE_SIDES).toFixed(2)}`);
  assert.ok(chiSquare(pairs, SEEDS / 36) < CHI2_DF35_P001, `pairs over seeds ${chiSquare(pairs, SEEDS / 36).toFixed(2)}`);
});

test('rng: rejection sampling is unbiased by construction and never returns out of range', () => {
  // The accepted region is the largest multiple of n below 2^32, so every residue is equally likely.
  for (const n of [2, 3, 6, 7, 10, 24, 1000, 3_000_000_000]) {
    const limit = 2 ** 32 - ((2 ** 32) % n);
    assert.equal(limit % n, 0);
  }
  let rng = createRng(3);
  for (let i = 0; i < 200_000; i++) {
    const r = nextInt(rng, 6);
    assert.ok(r.value >= 0 && r.value < 6);
    rng = r.rng;
  }
  // Rejection happens: pick a huge n so most raw values are rejected and the counter skips ahead.
  const big = nextInt(createRng(11), 3_000_000_000);
  assert.ok(big.rng.counter >= 1);
  assert.ok(big.value < 3_000_000_000);
});

test('rng: raw 32-bit output is well mixed (bit balance and no obvious counter structure)', () => {
  const N = 100_000;
  const ones = new Array<number>(32).fill(0);
  let repeats = 0;
  let prev = -1;
  for (let i = 0; i < N; i++) {
    const v = rawDraw(42, i);
    for (let b = 0; b < 32; b++) if ((v >>> b) & 1) ones[b]!++;
    if (v === prev) repeats++;
    prev = v;
  }
  for (let b = 0; b < 32; b++) assert.ok(Math.abs(ones[b]! / N - 0.5) < 0.01, `bit ${b} balance ${ones[b]! / N}`);
  assert.equal(repeats, 0);
  // Adjacent counters and adjacent seeds produce unrelated outputs.
  assert.notEqual(rawDraw(42, 0), rawDraw(42, 1));
  assert.notEqual(rawDraw(42, 0), rawDraw(43, 0));
  assert.notEqual(rawDraw(0, 0), rawDraw(1, 0));
});

test('rng: identical seed → identical dice sequence; different seed → different sequence; inputs never mutated', () => {
  const a = sampleDice(2024, 20_000);
  const b = sampleDice(2024, 20_000);
  assert.deepEqual(a, b);
  const c = sampleDice(2025, 20_000);
  assert.notDeepEqual(a.first, c.first);
  const state = createRng(9);
  rollDie(state, 6);
  rollTwoDice(state, 6);
  assert.deepEqual(state, { seed: 9, counter: 0 });
  // The two dice come from two consecutive draws, first die = first draw.
  const r = rollTwoDice(createRng(9), 6);
  assert.equal(r.dice[0], rollDie(createRng(9), 6).value);
  assert.equal(r.rng.counter, 2);
});
