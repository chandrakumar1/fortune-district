/**
 * Per-seat / per-player analysis over a batch: everything a seat (turn-order
 * position) or a player ID accumulates, averaged per match. Derived from event
 * logs, final states and per-round Net Worth snapshots only.
 *
 * "Physical seat" = index in MatchRecord.seatOrder, i.e. the turn-order slot.
 * "Player" = index in the match config, i.e. the identity that is dealt into a
 * seat by the engine's seeded START_MATCH shuffle. Comparing the two separates
 * seat advantage (does going first win?) from player fairness (does anyone win
 * more over many matches?). The analysis is post-hoc and consumes no RNG.
 */

import { computeNetWorth } from './engine.ts';
import type { PlayerId } from './engine.ts';
import { finalRanking } from './endgame.ts';
import type { MatchRecord } from './runner.ts';

export type GroupBy = 'seat' | 'player';

export interface SeatStats {
  /** 1-based physical seat, or 1-based player index when grouped by player. */
  readonly seat: number;
  readonly groupBy: GroupBy;
  /** Player id (groupBy 'player') or `seat-N` (groupBy 'seat'). */
  readonly label: string;
  readonly winRate: number;
  readonly meanFinalNetWorth: number;
  /** Mean Net Worth at the end of each round (index 1..12; 0 = before play). */
  readonly meanNetWorthByRound: readonly number[];
  readonly hubBonuses: number;
  readonly propertiesOwnedAtEnd: number;
  readonly purchasesAtList: number;
  readonly auctionWins: number;
  readonly auctionSpend: number;
  readonly upgrades: number;
  readonly upgradeSpend: number;
  readonly yieldPaid: number;
  readonly yieldReceived: number;
  readonly cappedPayments: number;
  readonly debtEverRate: number;
  readonly debtIncurred: number;
  readonly peakDebt: number;
  readonly interestPaid: number;
  readonly finalDebt: number;
  readonly leverageReceived: number;
  readonly leverageUsed: number;
  readonly creditLines: number;
  readonly windfallsAsLast: number;
  readonly auditPaid: number;
}

export function computeSeatStats(records: readonly MatchRecord[], groupBy: GroupBy = 'seat'): SeatStats[] {
  const n = records.length;
  if (n === 0) throw new Error('no matches');
  const seats = records[0]!.seatOrder.length;
  const configIds = records[0]!.finalState.config.players.map((p) => p.id);

  type Acc = {
    wins: number; finalNw: number; nwByRound: number[]; hub: number; owned: number; buys: number; auctionWins: number; auctionSpend: number;
    upgrades: number; upgradeSpend: number; yieldPaid: number; yieldReceived: number; capped: number; debtEver: number; debtIncurred: number;
    peakDebt: number; interest: number; finalDebt: number; levRecv: number; levUsed: number; credit: number; windfallLast: number; audit: number;
  };
  const acc: Acc[] = Array.from({ length: seats }, () => ({
    wins: 0, finalNw: 0, nwByRound: new Array<number>(13).fill(0), hub: 0, owned: 0, buys: 0, auctionWins: 0, auctionSpend: 0,
    upgrades: 0, upgradeSpend: 0, yieldPaid: 0, yieldReceived: 0, capped: 0, debtEver: 0, debtIncurred: 0,
    peakDebt: 0, interest: 0, finalDebt: 0, levRecv: 0, levUsed: 0, credit: 0, windfallLast: 0, audit: 0,
  }));

  for (const rec of records) {
    // Group index for a player: their turn-order slot, or their position in the match config.
    const seatOf = (id: PlayerId) => (groupBy === 'seat' ? rec.seatOrder.indexOf(id) : rec.finalState.config.players.findIndex((p) => p.id === id));
    const s = rec.finalState;
    const winner = finalRanking(rec)[0] as PlayerId;
    acc[seatOf(winner)]!.wins++;

    const debtBalance = new Map<PlayerId, number>();
    const peak = new Map<PlayerId, number>();
    const everDebt = new Set<PlayerId>();

    for (const e of s.eventLog) {
      switch (e.type) {
        case 'HUB_BONUS_PAID': acc[seatOf(e.player)]!.hub++; break;
        case 'PROPERTY_PURCHASED': acc[seatOf(e.player)]!.buys++; break;
        case 'AUCTION_RESOLVED':
          if (e.winner !== null) {
            acc[seatOf(e.winner)]!.auctionWins++;
            acc[seatOf(e.winner)]!.auctionSpend += e.winningBid ?? 0;
          }
          break;
        case 'PROPERTY_UPGRADED':
          acc[seatOf(e.player)]!.upgrades++;
          acc[seatOf(e.player)]!.upgradeSpend += e.cost;
          break;
        case 'PAYMENT_MADE':
          if (e.reason === 'yield' && e.to !== null) {
            acc[seatOf(e.from)]!.yieldPaid += e.paid;
            acc[seatOf(e.to)]!.yieldReceived += e.paid;
            if (e.capped) acc[seatOf(e.from)]!.capped++;
          } else if (e.reason === 'audit') {
            acc[seatOf(e.from)]!.audit += e.paid;
          }
          break;
        case 'DEBT_INCURRED': {
          acc[seatOf(e.player)]!.debtIncurred += e.amount;
          everDebt.add(e.player);
          const b = (debtBalance.get(e.player) ?? 0) + e.amount;
          debtBalance.set(e.player, b);
          peak.set(e.player, Math.max(peak.get(e.player) ?? 0, b));
          break;
        }
        case 'INTEREST_ACCRUED': {
          acc[seatOf(e.player)]!.interest += e.amount;
          const b = (debtBalance.get(e.player) ?? 0) + e.amount;
          debtBalance.set(e.player, b);
          peak.set(e.player, Math.max(peak.get(e.player) ?? 0, b));
          break;
        }
        case 'DEBT_REPAID': debtBalance.set(e.player, (debtBalance.get(e.player) ?? 0) - e.amount); break;
        case 'LEVERAGE_TOKEN_GRANTED': acc[seatOf(e.player)]!.levRecv++; break;
        case 'LEVERAGE_TOKEN_USED':
          acc[seatOf(e.player)]!.levUsed++;
          if (e.payload.kind === 'credit_line') acc[seatOf(e.player)]!.credit++;
          break;
        case 'WINDFALL_RECEIVED': if (e.wasLast) acc[seatOf(e.player)]!.windfallLast++; break;
        default: break;
      }
    }

    for (const p of s.players) {
      const a = acc[seatOf(p.id)]!;
      a.finalNw += computeNetWorth(s, p.id);
      for (let r = 0; r <= 12; r++) a.nwByRound[r] = (a.nwByRound[r] ?? 0) + (rec.netWorthByRound[r]?.[p.id] ?? 0);
      if (everDebt.has(p.id)) a.debtEver++;
      a.peakDebt += peak.get(p.id) ?? 0;
      a.finalDebt += p.debt;
    }
    for (const owner of Object.values(s.ownership)) acc[seatOf(owner)]!.owned++;
  }

  return acc.map((a, seat) => ({
    seat: seat + 1,
    groupBy,
    label: groupBy === 'seat' ? `seat-${seat + 1}` : (configIds[seat] ?? `player-${seat + 1}`),
    winRate: a.wins / n,
    meanFinalNetWorth: a.finalNw / n,
    meanNetWorthByRound: a.nwByRound.map((v) => v / n),
    hubBonuses: a.hub / n,
    propertiesOwnedAtEnd: a.owned / n,
    purchasesAtList: a.buys / n,
    auctionWins: a.auctionWins / n,
    auctionSpend: a.auctionSpend / n,
    upgrades: a.upgrades / n,
    upgradeSpend: a.upgradeSpend / n,
    yieldPaid: a.yieldPaid / n,
    yieldReceived: a.yieldReceived / n,
    cappedPayments: a.capped / n,
    debtEverRate: a.debtEver / n,
    debtIncurred: a.debtIncurred / n,
    peakDebt: a.peakDebt / n,
    interestPaid: a.interest / n,
    finalDebt: a.finalDebt / n,
    leverageReceived: a.levRecv / n,
    leverageUsed: a.levUsed / n,
    creditLines: a.credit / n,
    windfallsAsLast: a.windfallLast / n,
    auditPaid: a.audit / n,
  }));
}

export function formatSeatStats(stats: readonly SeatStats[], matches: number): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const c = (x: number) => `₵${x.toFixed(0)}`;
  const f = (x: number, d = 2) => x.toFixed(d);
  const groupBy = stats[0]?.groupBy ?? 'seat';
  const head = ['metric', ...stats.map((s) => (groupBy === 'seat' ? `seat ${s.seat}` : s.label))];
  const rows: string[][] = [
    ['win rate', ...stats.map((s) => pct(s.winRate))],
    ['mean final Net Worth', ...stats.map((s) => c(s.meanFinalNetWorth))],
    ...[2, 4, 6, 8, 10, 12].map((r) => [`mean Net Worth end R${r}`, ...stats.map((s) => c(s.meanNetWorthByRound[r] ?? 0))]),
    ['Hub bonuses / match', ...stats.map((s) => f(s.hubBonuses))],
    ['properties owned at end', ...stats.map((s) => f(s.propertiesOwnedAtEnd))],
    ['  bought at list', ...stats.map((s) => f(s.purchasesAtList))],
    ['  won at auction', ...stats.map((s) => f(s.auctionWins))],
    ['auction ₵ spent', ...stats.map((s) => c(s.auctionSpend))],
    ['upgrades / match', ...stats.map((s) => f(s.upgrades))],
    ['upgrade ₵ spent', ...stats.map((s) => c(s.upgradeSpend))],
    ['yield ₵ received', ...stats.map((s) => c(s.yieldReceived))],
    ['yield ₵ paid', ...stats.map((s) => c(s.yieldPaid))],
    ['capped payments / match', ...stats.map((s) => f(s.cappedPayments))],
    ['ever in debt (matches)', ...stats.map((s) => pct(s.debtEverRate))],
    ['debt incurred / match', ...stats.map((s) => c(s.debtIncurred))],
    ['peak debt / match', ...stats.map((s) => c(s.peakDebt))],
    ['interest paid / match', ...stats.map((s) => c(s.interestPaid))],
    ['debt at end', ...stats.map((s) => c(s.finalDebt))],
    ['Leverage received', ...stats.map((s) => f(s.leverageReceived))],
    ['Leverage used', ...stats.map((s) => f(s.leverageUsed))],
    ['  of which credit line', ...stats.map((s) => f(s.creditLines))],
    ['Windfall as last place', ...stats.map((s) => f(s.windfallsAsLast))],
    ['Audit ₵ paid', ...stats.map((s) => c(s.auditPaid))],
  ];
  const widths = head.map((_, i) => Math.max(head[i]!.length, ...rows.map((r) => r[i]!.length)));
  const line = (r: string[]) => r.map((v, i) => (i === 0 ? v.padEnd(widths[i]!) : v.padStart(widths[i]!))).join('  ');
  const title = groupBy === 'seat' ? `By physical seat (turn-order slot), averaged over ${matches} matches` : `By player id (dealt to a seat by the engine's seeded shuffle each match), averaged over ${matches} matches`;
  return [title, line(head), ...rows.map(line)].join('\n');
}
