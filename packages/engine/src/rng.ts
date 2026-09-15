/**
 * Counter-based deterministic PRNG (ADR-0001).
 *
 * Construction: splitmix32 addressed by index. The seed is hashed once into a
 * stream origin; draw `counter` is `finalise(origin + counter × φ32)`, where φ32
 * is the 32-bit golden-ratio constant. Because the state is `{ seed, counter }`
 * and every draw is a pure function of those two numbers, nothing is mutated
 * and replaying `(seed, commands)` reproduces every value bit for bit. The
 * golden-ratio stride visits every 32-bit state exactly once per 2^32 draws,
 * so the raw output is equidistributed over the counter range.
 *
 * Integers in [0, n) are produced by rejection sampling on the 32-bit output,
 * so no value of n introduces modulo bias. A rejected draw simply advances the
 * counter; the sequence stays deterministic.
 *
 * Math.random() is never used anywhere in the engine.
 */

import type { RngState } from './types.ts';

const GOLDEN = 0x9e3779b9;

/** splitmix32 finaliser (Murmur3-style avalanche with the constants from the splitmix32 reference). */
function finalise(x: number): number {
  let z = x | 0;
  z = (z ^ (z >>> 16)) | 0;
  z = Math.imul(z, 0x21f0aaad) | 0;
  z = (z ^ (z >>> 15)) | 0;
  z = Math.imul(z, 0x735a2d97) | 0;
  z = (z ^ (z >>> 15)) | 0;
  return z >>> 0;
}

/** Stream origin for a seed: hashed so that nearby seeds start far apart. */
function origin(seed: number): number {
  return finalise((seed | 0) ^ 0x5f3759df);
}

/** Raw 32-bit output for draw `counter` of `seed`. */
export function rawDraw(seed: number, counter: number): number {
  // counter may exceed 2^32 in principle; wrapping via | 0 after imul keeps everything in 32 bits.
  const stride = Math.imul(counter | 0, GOLDEN) | 0;
  return finalise((origin(seed) + stride) | 0);
}

export function createRng(seed: number): RngState {
  return { seed: seed | 0, counter: 0 };
}

const TWO_32 = 0x1_0000_0000;

/**
 * Uniform integer in [0, n) by rejection sampling: accept raw values below the
 * largest multiple of n that fits in 32 bits, otherwise draw again.
 */
export function nextInt(rng: RngState, n: number): { readonly value: number; readonly rng: RngState } {
  if (!Number.isInteger(n) || n <= 0 || n > TWO_32) throw new RangeError(`nextInt: n must be an integer in [1, 2^32], got ${n}`);
  const limit = TWO_32 - (TWO_32 % n); // exclusive; a multiple of n
  let counter = rng.counter;
  for (;;) {
    const raw = rawDraw(rng.seed, counter);
    counter += 1;
    if (raw < limit) return { value: raw % n, rng: { seed: rng.seed, counter } };
  }
}

/** Uniform integer in [1, sides]. */
export function rollDie(rng: RngState, sides: number): { readonly value: number; readonly rng: RngState } {
  const r = nextInt(rng, sides);
  return { value: r.value + 1, rng: r.rng };
}

/**
 * Two independent dice, each uniform in [1, sides], from consecutive draws.
 * Index 0 is the first die generated (the timeout default, locked rule 1).
 */
export function rollTwoDice(rng: RngState, sides: number): { readonly dice: readonly [number, number]; readonly rng: RngState } {
  const a = rollDie(rng, sides);
  const b = rollDie(a.rng, sides);
  return { dice: [a.value, b.value], rng: b.rng };
}

/** Fisher–Yates shuffle; returns a new array and the advanced state. */
export function shuffle<T>(rng: RngState, items: readonly T[]): { readonly value: T[]; readonly rng: RngState } {
  const out = items.slice();
  let state = rng;
  for (let i = out.length - 1; i > 0; i--) {
    const r = nextInt(state, i + 1);
    state = r.rng;
    const j = r.value;
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return { value: out, rng: state };
}
