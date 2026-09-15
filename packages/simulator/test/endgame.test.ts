import { test } from 'node:test';
import assert from 'node:assert/strict';

import { botsFor, playersFor, runBatch } from '../src/batch.ts';
import { computeEndgameMetrics, finalRanking, leaderAt, rankingAt } from '../src/endgame.ts';
import { applyCommand, computeNetWorth, createInitialState } from '../src/engine.ts';
import type { GameEvent, GameState } from '../src/engine.ts';
import { runMatch } from '../src/runner.ts';
import type { MatchRecord } from '../src/runner.ts';

/** Build a minimal MatchRecord from per-round Net Worth rows and a list of (round, event) pairs. */
function synthetic(
  seatOrder: readonly string[],
  rows: readonly (readonly number[])[], // rows[r] = net worth per player in seat order, r = 0..12
  events: readonly { round: number; type: string; extra?: Record<string, unknown> }[],
): MatchRecord {
  const netWorthByRound: Record<number, Record<string, number>> = {};
  rows.forEach((row, r) => {
    netWorthByRound[r] = Object.fromEntries(seatOrder.map((id, i) => [id, row[i]!]));
  });
  const last = rows[12]!;
  const ranking = seatOrder
    .map((id, i) => ({ player: id, netWorth: last[i]! }))
    .sort((a, b) => b.netWorth - a.netWorth);
  const eventLog = [
    ...events.map((e, i) => ({ seq: i, round: e.round, type: e.type, ...(e.extra ?? {}) })),
    { seq: events.length, round: 12, type: 'MATCH_ENDED', ranking },
  ] as unknown as GameEvent[];
  const finalState = { eventLog } as unknown as GameState;
  return { seed: 0, seatOrder, finalState, commands: [], commandCount: 0, turnSeconds: 0, netWorthByRound, finalHash: '' };
}

test('endgame: leader / ranking helpers use Net Worth descending with seat-order ties', () => {
  const rows: number[][] = [];
  for (let r = 0; r <= 12; r++) rows.push([1200, 1200, 1200]);
  rows[5] = [1300, 1250, 1400]; // c leads at R5
  rows[12] = [1500, 1500, 1400]; // a and b tie at the end → a (earlier seat) first
  const rec = synthetic(['a', 'b', 'c'], rows, []);
  assert.deepEqual(rankingAt(rec, 5), ['c', 'a', 'b']);
  assert.equal(leaderAt(rec, 5), 'c');
  assert.deepEqual(rankingAt(rec, 12), ['a', 'b', 'c']);
  assert.deepEqual(finalRanking(rec), ['a', 'b', 'c']);
});

test('endgame: hypothesis metrics on hand-built records give the expected fractions', () => {
  // Match 1: a leads from R6 on and wins; last at R10 (c) stays last.
  const m1: number[][] = [];
  for (let r = 0; r <= 12; r++) m1.push(r < 6 ? [1200, 1300, 1250] : [1600, 1300, 1250]);
  // Match 2: b leads through R10, then a overtakes in R11; c is last at R10 but finishes 2nd.
  const m2: number[][] = [];
  for (let r = 0; r <= 12; r++) m2.push(r <= 10 ? [1300, 1500, 1200] : [1700, 1500, 1550]);
  const recs = [
    synthetic(['a', 'b', 'c'], m1, [
      { round: 11, type: 'PROPERTY_PURCHASED' },
      { round: 12, type: 'PROPERTY_UPGRADED' },
      { round: 3, type: 'PROPERTY_PURCHASED' },
    ]),
    synthetic(['a', 'b', 'c'], m2, [
      { round: 12, type: 'PAYMENT_MADE', extra: { reason: 'yield', paid: 40, capped: true } },
      { round: 12, type: 'PAYMENT_MADE', extra: { reason: 'audit', paid: 10, capped: false } },
    ]),
  ];
  const m = computeEndgameMetrics(recs);
  assert.equal(m.matches, 2);
  // Leader at R10 wins in match 1 only → 50%; at R12 always 100%; at R5 nobody (b leads both) → 0%.
  assert.equal(m.leaderAtRoundWins[10], 0.5);
  assert.equal(m.leaderAtRoundWins[12], 1);
  assert.equal(m.leaderAtRoundWins[5], 0);
  // Leader changes: 5→6 in match 1 (b→a), 10→11 in match 2 (b→a).
  assert.equal(m.leaderChangedFromRound[5], 0.5);
  assert.equal(m.leaderChangedFromRound[10], 0.5);
  assert.equal(m.leaderChangedFromRound[1], 0);
  // Winner's rank at R10: match 1 → #1, match 2 → #2.
  assert.deepEqual(m.winnerRankAtRound10, [0.5, 0.5, 0]);
  // Ranking changed after R10 in match 2 only; last place at R10 escaped in match 2 only.
  assert.equal(m.rankingChangedAfterRound10, 0.5);
  assert.equal(m.lastPlaceEscapedAfterRound10, 0.5);
  // Activity tallies are per match, keyed by the event's round.
  assert.equal(m.activity[11]!.purchases, 0.5);
  assert.equal(m.activity[3]!.purchases, 0.5);
  assert.equal(m.activity[12]!.upgrades, 0.5);
  assert.equal(m.activity[12]!.yieldPayments, 0.5);
  assert.equal(m.activity[12]!.yieldCredits, 20);
  assert.equal(m.activity[12]!.cappedPayments, 0.5);
  // |ΔNW| in round 6 of match 1: a +400, others 0 → mean over 6 player-rounds = 400/6.
  assert.ok(Math.abs(m.activity[6]!.meanAbsNetWorthDelta - 400 / 6) < 1e-9);
  // Spread / lead margin at R12: match 1 (1600−1250, 1600−1300), match 2 (1700−1500, 1700−1550) averaged.
  assert.equal(m.activity[12]!.meanSpread, (350 + 200) / 2);
  assert.equal(m.activity[12]!.meanLeadMargin, (300 + 150) / 2);
  // Late-round ratio = mean of R11–12 over mean of R1–10, per counter.
  const earlyPurchases = Array.from({ length: 10 }, (_, i) => m.activity[i + 1]!.purchases).reduce((a, b) => a + b, 0) / 10;
  const latePurchases = (m.activity[11]!.purchases + m.activity[12]!.purchases) / 2;
  assert.equal(m.lateRoundActivityRatio.purchases, latePurchases / earlyPurchases);
});

test('runner: round snapshots are the engine\'s Net Worth — round 0 before play, round 12 final, and interest-corrected in between', () => {
  const players = playersFor(4);
  const rec = runMatch({ seed: 21, players, bots: botsFor(['greedy', 'random', 'random', 'passive'], 4, 21) });
  const fresh = createInitialState({ matchId: 'x', seed: 21, players });
  for (const p of fresh.players) assert.equal(rec.netWorthByRound[0]![p.id], computeNetWorth(fresh, p.id));
  for (const p of rec.finalState.players) assert.equal(rec.netWorthByRound[12]![p.id], computeNetWorth(rec.finalState, p.id));
  // Consistency: the R11 snapshot differs from the post-command value exactly by round-12 interest.
  const interest12: Record<string, number> = {};
  for (const e of rec.finalState.eventLog) if (e.type === 'INTEREST_ACCRUED' && e.round === 12) interest12[e.player] = (interest12[e.player] ?? 0) + e.amount;
  // Recompute by replaying the commands up to and including the one that ends round 11.
  let s = createInitialState({ matchId: 'sim-21', seed: 21, players });
  for (const cmd of rec.commands) {
    const r = applyCommand(s, cmd);
    if (!r.ok) throw new Error(r.error.code);
    s = r.state;
    if (r.events.some((e) => e.type === 'ROUND_ENDED' && e.round === 11)) break;
  }
  for (const p of s.players) assert.equal(rec.netWorthByRound[11]![p.id], computeNetWorth(s, p.id) + (interest12[p.id] ?? 0));
});

test('endgame: activity tallies over a real batch reconcile with the raw event log; invariants hold', () => {
  const records = runBatch({ matches: 40, players: 4, bots: ['greedy', 'random', 'passive', 'timeout'], seed: 11 });
  const m = computeEndgameMetrics(records);
  const n = records.length;
  const count = (type: string, pred: (e: GameEvent) => boolean = () => true) =>
    records.reduce((a, r) => a + r.finalState.eventLog.filter((e) => e.type === type && pred(e)).length, 0);
  const sumRounds = (k: keyof (typeof m.activity)[1]) => Array.from({ length: 12 }, (_, i) => m.activity[i + 1]![k]).reduce((a, b) => a + b, 0) * n;
  assert.ok(Math.abs(sumRounds('purchases') - count('PROPERTY_PURCHASED')) < 1e-6);
  assert.ok(Math.abs(sumRounds('auctionsOpened') - count('AUCTION_OPENED')) < 1e-6);
  assert.ok(Math.abs(sumRounds('upgrades') - count('PROPERTY_UPGRADED')) < 1e-6);
  assert.ok(Math.abs(sumRounds('leverageUsed') - count('LEVERAGE_TOKEN_USED')) < 1e-6);
  assert.ok(Math.abs(sumRounds('hubBonuses') - count('HUB_BONUS_PAID')) < 1e-6);
  assert.ok(Math.abs(sumRounds('timeouts') - count('TURN_TIMED_OUT')) < 1e-6);
  assert.ok(Math.abs(sumRounds('yieldPayments') - count('PAYMENT_MADE', (e) => e.type === 'PAYMENT_MADE' && e.reason === 'yield')) < 1e-6);
  // The timeout bot times out every round.
  for (let r = 1; r <= 12; r++) assert.ok(m.activity[r]!.timeouts > 0, `round ${r}`);
  // Invariants.
  assert.equal(m.leaderAtRoundWins[12], 1);
  assert.ok(Math.abs(m.winnerRankAtRound10.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(Math.abs(m.winnerRankAtRound6.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  for (let r = 1; r <= 11; r++) assert.ok((m.leaderChangedFromRound[r] ?? -1) >= 0 && (m.leaderChangedFromRound[r] ?? 2) <= 1);
  assert.ok(m.rankingChangedAfterRound10 >= m.lastPlaceEscapedAfterRound10 - 1e-9);
  // Leader→wins at R11 can never be below the fraction where the leader did not change 11→12.
  assert.ok((m.leaderAtRoundWins[11] ?? 0) >= 1 - (m.leaderChangedFromRound[11] ?? 0) - 1e-9);
  for (const v of Object.values(m.lateRoundActivityRatio)) assert.ok(Number.isFinite(v) && v >= 0);
});
