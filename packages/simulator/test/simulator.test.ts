import { test } from 'node:test';
import assert from 'node:assert/strict';

import { botsFor, checkDeterminism, playersFor, runBatch } from '../src/batch.ts';
import { computeMetrics } from '../src/metrics.ts';
import { replay, runMatch } from '../src/runner.ts';

test('runner: a 4-player match of mixed bots completes 12 rounds with a legal command stream', () => {
  const rec = runMatch({ seed: 1, players: playersFor(4), bots: botsFor(['greedy', 'random', 'passive', 'timeout'], 4, 1) });
  const s = rec.finalState;
  assert.equal(s.phase.kind, 'ended');
  assert.equal(s.round, 12);
  assert.equal(s.eventLog.filter((e) => e.type === 'ROUND_ENDED').length, 12);
  assert.equal(s.eventLog.filter((e) => e.type === 'CITY_PULSE_APPLIED').length, 3);
  assert.equal(s.eventLog.filter((e) => e.type === 'TURN_STARTED').length, 48);
  assert.ok(rec.commandCount > 48);
  assert.ok(rec.turnSeconds > 0 && rec.turnSeconds <= 48 * 20 + 48 * 10);
  assert.equal(Object.keys(rec.netWorthByRound).length, 13);
  for (let r = 0; r <= 12; r++) assert.equal(Object.keys(rec.netWorthByRound[r]!).length, 4);
});

test('runner: replaying the recorded commands reproduces the final hash', () => {
  const players = playersFor(3);
  const rec = runMatch({ seed: 9, players, bots: botsFor(['random', 'greedy', 'random'], 3, 9) });
  assert.equal(replay(9, players, rec.commands), rec.finalHash);
});

test('determinism self-check passes across a small batch of every bot kind', () => {
  assert.deepEqual(checkDeterminism({ matches: 8, players: 4, bots: ['greedy', 'random', 'passive', 'timeout'], seed: 100 }), []);
  assert.deepEqual(checkDeterminism({ matches: 4, players: 2, bots: ['random', 'random'], seed: 200 }), []);
});

test('metrics: computed from a batch without touching hidden state', () => {
  const records = runBatch({ matches: 6, players: 4, bots: ['greedy', 'random', 'random', 'passive'], seed: 7 });
  const m = computeMetrics(records);
  assert.equal(m.matches, 6);
  assert.equal(m.players, 4);
  assert.ok(m.avgCommands > 0);
  assert.ok(m.avgMatchMinutes > 0);
  assert.equal(m.winRateBySeat.length, 4);
  assert.ok(Math.abs(m.winRateBySeat.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(m.avgPropertiesOwnedAtEnd + m.avgUnownedAtEnd === 18);
  assert.ok(m.cappedPaymentRate >= 0 && m.cappedPaymentRate <= 1);
});

test('bots only ever see a PlayerView: the view never contains other bids or the rng', () => {
  let leaked = false;
  const players = playersFor(2);
  const bots = botsFor(['random', 'random'], 2, 5);
  const spy = {
    ...bots['p1']!,
    decide(view: Parameters<NonNullable<(typeof bots)['p1']>['decide']>[0], legal: Parameters<NonNullable<(typeof bots)['p1']>['decide']>[1]) {
      if ('rng' in view.state || (view.state.auction && 'bids' in view.state.auction)) leaked = true;
      return bots['p1']!.decide(view, legal);
    },
    bid(view: Parameters<NonNullable<(typeof bots)['p1']>['bid']>[0], a: Parameters<NonNullable<(typeof bots)['p1']>['bid']>[1]) {
      if ('rng' in view.state || (view.state.auction && 'bids' in view.state.auction)) leaked = true;
      return bots['p1']!.bid(view, a);
    },
  };
  runMatch({ seed: 5, players, bots: { p1: spy, p2: bots['p2']! } });
  assert.equal(leaked, false);
});
