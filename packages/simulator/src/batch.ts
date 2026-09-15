/**
 * Batch helpers: build bots per seat, run N matches, self-check determinism.
 */

import { createBot } from './bots.ts';
import type { Bot, BotKind } from './bots.ts';
import { replay, runMatch } from './runner.ts';
import type { MatchRecord } from './runner.ts';

export interface BatchOptions {
  readonly matches: number;
  readonly players: number;
  readonly bots: readonly BotKind[];
  readonly seed: number;
}

const IDS = ['p1', 'p2', 'p3', 'p4'] as const;

export function playersFor(n: number): { id: string; displayName: string }[] {
  return IDS.slice(0, n).map((id, i) => ({ id, displayName: `Player ${i + 1}` }));
}

export function botsFor(kinds: readonly BotKind[], n: number, seed: number): Record<string, Bot> {
  const out: Record<string, Bot> = {};
  playersFor(n).forEach((p, i) => {
    const kind = kinds[i % kinds.length] ?? 'random';
    // Bot RNG seeds derive from the match seed so a batch is reproducible.
    out[p.id] = createBot(kind, p.id, (seed * 31 + i * 7919) | 0);
  });
  return out;
}

export function runBatch(opts: BatchOptions): MatchRecord[] {
  const records: MatchRecord[] = [];
  for (let i = 0; i < opts.matches; i++) {
    const seed = (opts.seed + i) | 0;
    records.push(runMatch({ seed, players: playersFor(opts.players), bots: botsFor(opts.bots, opts.players, seed) }));
  }
  return records;
}

/**
 * S3: run each match twice with fresh bots and replay its command log; all
 * three hashes must agree. Returns the seeds that diverged (empty = pass).
 */
export function checkDeterminism(opts: BatchOptions): number[] {
  const failures: number[] = [];
  for (let i = 0; i < opts.matches; i++) {
    const seed = (opts.seed + i) | 0;
    const players = playersFor(opts.players);
    const a = runMatch({ seed, players, bots: botsFor(opts.bots, opts.players, seed) });
    const b = runMatch({ seed, players, bots: botsFor(opts.bots, opts.players, seed) });
    const c = replay(seed, players, a.commands);
    if (a.finalHash !== b.finalHash || a.finalHash !== c) failures.push(seed);
  }
  return failures;
}
