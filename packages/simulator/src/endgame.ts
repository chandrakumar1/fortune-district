/**
 * Round-by-round instrumentation for two hypotheses from the Paper Playtest Kit:
 *
 *   "Dead rounds 11–12"  — do the last two rounds still change anything?
 *   "Leader catch-up"    — how often does the leader at round r fail to win?
 *
 * Everything here is derived from MatchRecord.netWorthByRound and the event
 * log. Nothing interprets rules; leader = highest Net Worth as the engine
 * reports it (ties resolved in seat order, matching MATCH_ENDED ranking).
 */

import type { GameEvent, PlayerId } from './engine.ts';
import type { MatchRecord } from './runner.ts';

export const ROUNDS = 12;

/** Per-round activity counts, averaged per match. */
export interface RoundActivity {
  readonly purchases: number;
  readonly auctionsOpened: number;
  readonly auctionsWon: number;
  readonly upgrades: number;
  readonly leverageUsed: number;
  readonly yieldPayments: number;
  readonly yieldCredits: number;
  readonly cappedPayments: number;
  readonly debtIncurredCredits: number;
  readonly hubBonuses: number;
  readonly timeouts: number;
  /** Mean absolute Net Worth change per player during the round (₵). */
  readonly meanAbsNetWorthDelta: number;
  /** Mean (max − min) Net Worth at the end of the round (₵). */
  readonly meanSpread: number;
  /** Mean gap between leader and runner-up at the end of the round (₵). */
  readonly meanLeadMargin: number;
}

export interface EndgameMetrics {
  readonly matches: number;
  /** activity[r] for r = 1..12. */
  readonly activity: Readonly<Record<number, RoundActivity>>;
  /** Fraction of matches whose leader at the end of round r is the final winner (r = 1..12; [12] = 1). */
  readonly leaderAtRoundWins: Readonly<Record<number, number>>;
  /** Fraction of matches where the leader changed between the end of round r and the end of round r+1. */
  readonly leaderChangedFromRound: Readonly<Record<number, number>>;
  /** Fraction of matches where the winner was ranked k-th (1-based) at the end of round 10. */
  readonly winnerRankAtRound10: readonly number[];
  /** Same at the end of round 8 and 6. */
  readonly winnerRankAtRound8: readonly number[];
  readonly winnerRankAtRound6: readonly number[];
  /** Fraction of matches where any position in the full ranking differs between end of R10 and final. */
  readonly rankingChangedAfterRound10: number;
  /** Fraction of matches where the last-place player at end of R10 finished anywhere but last. */
  readonly lastPlaceEscapedAfterRound10: number;
  /** R11–12 mean activity as a ratio of the R1–10 mean, per counter (1.0 = same pace). */
  readonly lateRoundActivityRatio: Readonly<Record<keyof RoundActivity, number>>;
}

interface Totals {
  purchases: number;
  auctionsOpened: number;
  auctionsWon: number;
  upgrades: number;
  leverageUsed: number;
  yieldPayments: number;
  yieldCredits: number;
  cappedPayments: number;
  debtIncurredCredits: number;
  hubBonuses: number;
  timeouts: number;
  absDelta: number;
  deltaSamples: number;
  spread: number;
  leadMargin: number;
}

function emptyTotals(): Totals {
  return {
    purchases: 0, auctionsOpened: 0, auctionsWon: 0, upgrades: 0, leverageUsed: 0, yieldPayments: 0, yieldCredits: 0,
    cappedPayments: 0, debtIncurredCredits: 0, hubBonuses: 0, timeouts: 0, absDelta: 0, deltaSamples: 0, spread: 0, leadMargin: 0,
  };
}

/** Ranking at the end of a round: ids sorted by Net Worth descending, ties by seat order. */
export function rankingAt(rec: MatchRecord, round: number): PlayerId[] {
  const snap = rec.netWorthByRound[round];
  if (!snap) throw new Error(`no snapshot for round ${round}`);
  return rec.seatOrder.slice().sort((a, b) => (snap[b] ?? 0) - (snap[a] ?? 0) || rec.seatOrder.indexOf(a) - rec.seatOrder.indexOf(b));
}

export function leaderAt(rec: MatchRecord, round: number): PlayerId {
  return rankingAt(rec, round)[0] as PlayerId;
}

/** The engine's final ranking (MATCH_ENDED), which is authoritative for "winner". */
export function finalRanking(rec: MatchRecord): PlayerId[] {
  const end = rec.finalState.eventLog.find((e): e is Extract<GameEvent, { type: 'MATCH_ENDED' }> => e.type === 'MATCH_ENDED');
  if (!end) throw new Error('match has no MATCH_ENDED event');
  return end.ranking.map((r) => r.player);
}

function tallyEvents(rec: MatchRecord, totals: Record<number, Totals>): void {
  for (const e of rec.finalState.eventLog) {
    const t = totals[e.round];
    if (!t) continue;
    switch (e.type) {
      case 'PROPERTY_PURCHASED': t.purchases++; break;
      case 'AUCTION_OPENED': t.auctionsOpened++; break;
      case 'AUCTION_RESOLVED': if (e.winner !== null) t.auctionsWon++; break;
      case 'PROPERTY_UPGRADED': t.upgrades++; break;
      case 'LEVERAGE_TOKEN_USED': t.leverageUsed++; break;
      case 'PAYMENT_MADE':
        if (e.reason === 'yield') {
          t.yieldPayments++;
          t.yieldCredits += e.paid;
          if (e.capped) t.cappedPayments++;
        }
        break;
      case 'DEBT_INCURRED': t.debtIncurredCredits += e.amount; break;
      case 'HUB_BONUS_PAID': t.hubBonuses++; break;
      case 'TURN_TIMED_OUT': t.timeouts++; break;
      default: break;
    }
  }
}

export function computeEndgameMetrics(records: readonly MatchRecord[]): EndgameMetrics {
  const n = records.length;
  if (n === 0) throw new Error('no matches');
  const playerCount = records[0]!.seatOrder.length;

  const totals: Record<number, Totals> = {};
  for (let r = 1; r <= ROUNDS; r++) totals[r] = emptyTotals();
  const leaderWins: Record<number, number> = {};
  const leaderChanged: Record<number, number> = {};
  for (let r = 1; r <= ROUNDS; r++) {
    leaderWins[r] = 0;
    leaderChanged[r] = 0;
  }
  const rankAt10 = new Array<number>(playerCount).fill(0);
  const rankAt8 = new Array<number>(playerCount).fill(0);
  const rankAt6 = new Array<number>(playerCount).fill(0);
  let rankingChanged = 0;
  let lastEscaped = 0;

  for (const rec of records) {
    tallyEvents(rec, totals);
    const final = finalRanking(rec);
    const winner = final[0] as PlayerId;

    for (let r = 1; r <= ROUNDS; r++) {
      const t = totals[r]!;
      const snap = rec.netWorthByRound[r]!;
      const prev = r === 1 ? null : rec.netWorthByRound[r - 1]!;
      const ranked = rankingAt(rec, r);
      const values = ranked.map((id) => snap[id] ?? 0);
      t.spread += (values[0] ?? 0) - (values[values.length - 1] ?? 0);
      t.leadMargin += (values[0] ?? 0) - (values[1] ?? 0);
      for (const id of rec.seatOrder) {
        const before = (prev ?? rec.netWorthByRound[0] ?? {})[id] ?? 0;
        t.absDelta += Math.abs((snap[id] ?? 0) - before);
        t.deltaSamples++;
      }
      if (ranked[0] === winner) leaderWins[r]!++;
      if (r < ROUNDS && leaderAt(rec, r) !== leaderAt(rec, r + 1)) leaderChanged[r]!++;
    }

    const r10 = rankingAt(rec, 10);
    const r8 = rankingAt(rec, 8);
    const r6 = rankingAt(rec, 6);
    rankAt10[r10.indexOf(winner)]!++;
    rankAt8[r8.indexOf(winner)]!++;
    rankAt6[r6.indexOf(winner)]!++;
    if (r10.some((id, i) => id !== final[i])) rankingChanged++;
    if (final[final.length - 1] !== r10[r10.length - 1]) lastEscaped++;
  }

  const activity: Record<number, RoundActivity> = {};
  for (let r = 1; r <= ROUNDS; r++) {
    const t = totals[r]!;
    activity[r] = {
      purchases: t.purchases / n,
      auctionsOpened: t.auctionsOpened / n,
      auctionsWon: t.auctionsWon / n,
      upgrades: t.upgrades / n,
      leverageUsed: t.leverageUsed / n,
      yieldPayments: t.yieldPayments / n,
      yieldCredits: t.yieldCredits / n,
      cappedPayments: t.cappedPayments / n,
      debtIncurredCredits: t.debtIncurredCredits / n,
      hubBonuses: t.hubBonuses / n,
      timeouts: t.timeouts / n,
      meanAbsNetWorthDelta: t.deltaSamples === 0 ? 0 : t.absDelta / t.deltaSamples,
      meanSpread: t.spread / n,
      meanLeadMargin: t.leadMargin / n,
    };
  }

  const keys = Object.keys(activity[1]!) as (keyof RoundActivity)[];
  const ratio: Record<string, number> = {};
  for (const k of keys) {
    let early = 0;
    for (let r = 1; r <= 10; r++) early += activity[r]![k];
    early /= 10;
    const late = (activity[11]![k] + activity[12]![k]) / 2;
    ratio[k] = early === 0 ? (late === 0 ? 1 : Infinity) : late / early;
  }

  const frac = (m: Record<number, number>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v / n]));

  return {
    matches: n,
    activity,
    leaderAtRoundWins: frac(leaderWins),
    leaderChangedFromRound: frac(Object.fromEntries(Object.entries(leaderChanged).filter(([k]) => Number(k) < ROUNDS))),
    winnerRankAtRound10: rankAt10.map((c) => c / n),
    winnerRankAtRound8: rankAt8.map((c) => c / n),
    winnerRankAtRound6: rankAt6.map((c) => c / n),
    rankingChangedAfterRound10: rankingChanged / n,
    lastPlaceEscapedAfterRound10: lastEscaped / n,
    lateRoundActivityRatio: ratio as Record<keyof RoundActivity, number>,
  };
}

export function formatEndgameMetrics(m: EndgameMetrics): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const f1 = (x: number) => x.toFixed(2);
  const lines: string[] = [];
  lines.push(`Round-by-round (per match, ${m.matches} matches)`);
  lines.push('round  buys  aucts  upgr  lever  yield  ₵yield  capped  ₵debt  hub   |ΔNW|/player  spread  lead-margin  leader→wins');
  for (let r = 1; r <= ROUNDS; r++) {
    const a = m.activity[r]!;
    lines.push(
      `${String(r).padStart(5)}  ${f1(a.purchases).padStart(4)}  ${f1(a.auctionsOpened).padStart(5)}  ${f1(a.upgrades).padStart(4)}  ${f1(a.leverageUsed).padStart(5)}  ${f1(a.yieldPayments).padStart(5)}  ${a.yieldCredits.toFixed(0).padStart(6)}  ${f1(a.cappedPayments).padStart(6)}  ${a.debtIncurredCredits.toFixed(0).padStart(5)}  ${f1(a.hubBonuses).padStart(4)}  ${a.meanAbsNetWorthDelta.toFixed(0).padStart(12)}  ${a.meanSpread.toFixed(0).padStart(6)}  ${a.meanLeadMargin.toFixed(0).padStart(11)}  ${pct(m.leaderAtRoundWins[r] ?? 0).padStart(11)}`,
    );
  }
  const rr = m.lateRoundActivityRatio;
  lines.push('');
  lines.push(`R11–12 pace vs R1–10 mean: buys ×${f1(rr.purchases)} · auctions ×${f1(rr.auctionsOpened)} · upgrades ×${f1(rr.upgrades)} · leverage ×${f1(rr.leverageUsed)} · yield ₵ ×${f1(rr.yieldCredits)} · |ΔNW| ×${f1(rr.meanAbsNetWorthDelta)}`);
  lines.push(`Leader changed between consecutive rounds: ${Object.entries(m.leaderChangedFromRound).map(([r, v]) => `${r}→${Number(r) + 1} ${pct(v)}`).join(' · ')}`);
  const ranks = (v: readonly number[]) => v.map((x, i) => `#${i + 1} ${pct(x)}`).join(' · ');
  lines.push(`Winner's rank at end of R6:  ${ranks(m.winnerRankAtRound6)}`);
  lines.push(`Winner's rank at end of R8:  ${ranks(m.winnerRankAtRound8)}`);
  lines.push(`Winner's rank at end of R10: ${ranks(m.winnerRankAtRound10)}`);
  lines.push(`Any ranking position changed after R10: ${pct(m.rankingChangedAfterRound10)} · last place at R10 escaped last: ${pct(m.lastPlaceEscapedAfterRound10)}`);
  return lines.join('\n');
}
