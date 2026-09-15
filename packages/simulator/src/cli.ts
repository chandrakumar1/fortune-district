/**
 * fd-sim — headless simulator CLI (SIMULATOR_SPEC §4).
 *
 *   node src/cli.ts run --matches 1000 --players 4 --bots greedy,random,random,passive --seed 42 [--json]
 *   node src/cli.ts check-determinism --matches 100 [--players 4] [--bots ...] [--seed 42]
 *   node src/cli.ts replay --log match.jsonl
 *   node src/cli.ts seats --matches 10000 --players 4 --bots random,random,random,random --seed 42 [--by seat|player|both]
 */

import { readFileSync } from 'node:fs';

import { checkDeterminism, playersFor, runBatch } from './batch.ts';
import type { BotKind } from './bots.ts';
import { computeEndgameMetrics, formatEndgameMetrics } from './endgame.ts';
import { computeMetrics, formatMetrics } from './metrics.ts';
import { replay } from './runner.ts';
import { computeSeatStats, formatSeatStats } from './seats.ts';
import type { Command } from './engine.ts';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? (process.argv[i + 1] as string) : fallback;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const command = process.argv[2] ?? 'run';
const matches = Number(arg('matches', '100'));
const players = Number(arg('players', '4'));
const seed = Number(arg('seed', '42'));
const bots = arg('bots', 'greedy,random,random,passive').split(',') as BotKind[];

switch (command) {
  case 'run': {
    const started = performance.now();
    const records = runBatch({ matches, players, bots, seed });
    const elapsed = (performance.now() - started) / 1000;
    const metrics = computeMetrics(records);
    const endgame = computeEndgameMetrics(records);
    if (flag('json')) {
      console.log(JSON.stringify({ metrics, endgame, wallSeconds: elapsed }, null, 2));
    } else {
      console.log(formatMetrics(metrics));
      console.log('');
      console.log(formatEndgameMetrics(endgame));
      console.log(`\nWall time: ${elapsed.toFixed(2)} s (${(matches / Math.max(elapsed, 1e-9) * 60).toFixed(0)} matches/min)`);
    }
    if (flag('log')) {
      for (const r of records) console.log(JSON.stringify({ seed: r.seed, players: playersFor(players), commands: r.commands, hash: r.finalHash }));
    }
    break;
  }
  case 'seats': {
    const by = arg('by', 'seat');
    const records = runBatch({ matches, players, bots, seed });
    const groups = by === 'both' ? (['seat', 'player'] as const) : ([by] as ('seat' | 'player')[]);
    const out: Record<string, unknown> = { matches, players, bots, seed };
    for (const g of groups) {
      const stats = computeSeatStats(records, g);
      if (flag('json')) out[g] = stats;
      else console.log(formatSeatStats(stats, matches) + '\n');
    }
    if (flag('json')) console.log(JSON.stringify(out, null, 2));
    break;
  }
  case 'check-determinism': {
    const failures = checkDeterminism({ matches, players, bots, seed });
    if (failures.length === 0) {
      console.log(`determinism OK: ${matches} matches × 2 runs + replay agree`);
    } else {
      console.error(`determinism FAILED for seeds: ${failures.join(', ')}`);
      process.exitCode = 1;
    }
    break;
  }
  case 'replay': {
    const file = arg('log', '');
    if (!file) throw new Error('--log <file> required');
    const lines = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim().length > 0);
    let ok = 0;
    for (const line of lines) {
      const rec = JSON.parse(line) as { seed: number; players: { id: string; displayName: string }[]; commands: Command[]; hash: string };
      const hash = replay(rec.seed, rec.players, rec.commands);
      if (hash !== rec.hash) {
        console.error(`seed ${rec.seed}: hash mismatch ${hash} ≠ ${rec.hash}`);
        process.exitCode = 1;
      } else ok++;
    }
    console.log(`replayed ${ok}/${lines.length} matches OK`);
    break;
  }
  default:
    console.error(`unknown command ${command}`);
    process.exitCode = 2;
}
