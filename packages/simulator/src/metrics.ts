/**
 * Aggregate metrics over a batch of matches (SIMULATOR_SPEC §3). Computed
 * from the event log and final state only.
 */

import { PROPERTY_CATEGORIES, categoryTiles, computeNetWorth } from './engine.ts';
import type { PlayerId } from './engine.ts';
import type { MatchRecord } from './runner.ts';

export interface BatchMetrics {
  readonly matches: number;
  readonly players: number;
  readonly avgTurnSeconds: number;
  readonly avgMatchMinutes: number;
  readonly avgCommands: number;
  readonly avgTimeouts: number;
  readonly avgAuctions: number;
  readonly zeroBidAuctionRate: number;
  readonly avgAuctionPriceToList: number | null;
  readonly avgYieldPayments: number;
  readonly cappedPaymentRate: number;
  readonly avgCreditsWithheldByCap: number;
  readonly playersEverInDebtRate: number;
  readonly avgPeakDebt: number;
  readonly avgInterestPaid: number;
  readonly avgLeverageGranted: number;
  readonly avgLeverageUsed: number;
  readonly leverageUseByKind: Readonly<Record<string, number>>;
  readonly avgPulseRerolls: number;
  readonly avgCompleteSets: number;
  readonly matchesWithAnySetRate: number;
  readonly avgNetWorthSpread: number;
  readonly leaderChangedAfterRound6Rate: number;
  readonly winRateBySeat: readonly number[];
  readonly avgPropertiesOwnedAtEnd: number;
  readonly avgUnownedAtEnd: number;
}

export function computeMetrics(records: readonly MatchRecord[]): BatchMetrics {
  const n = records.length;
  if (n === 0) throw new Error('no matches');
  const playerCount = records[0]!.finalState.players.length;

  let turnSeconds = 0;
  let commands = 0;
  let timeouts = 0;
  let auctions = 0;
  let zeroBid = 0;
  let priceRatioSum = 0;
  let priceRatioCount = 0;
  let yieldPayments = 0;
  let capped = 0;
  let withheld = 0;
  let playersInDebt = 0;
  let peakDebtSum = 0;
  let interest = 0;
  let granted = 0;
  let used = 0;
  const useByKind: Record<string, number> = {};
  let rerolls = 0;
  let sets = 0;
  let matchesWithSet = 0;
  let spread = 0;
  let leaderChanged = 0;
  const winsBySeat = new Array<number>(playerCount).fill(0);
  let ownedAtEnd = 0;
  let unownedAtEnd = 0;

  for (const rec of records) {
    const s = rec.finalState;
    turnSeconds += rec.turnSeconds;
    commands += rec.commandCount;
    const debtBalance: Record<PlayerId, number> = {};
    const peak: Record<PlayerId, number> = {};
    for (const p of s.players) {
      debtBalance[p.id] = 0;
      peak[p.id] = 0;
    }
    for (const e of s.eventLog) {
      switch (e.type) {
        case 'TURN_TIMED_OUT':
          timeouts++;
          break;
        case 'AUCTION_OPENED':
          auctions++;
          break;
        case 'AUCTION_RESOLVED':
          if (e.winner === null) zeroBid++;
          else {
            const tile = s.board[e.tileIndex];
            if (tile && tile.kind === 'property' && e.winningBid !== null) {
              priceRatioSum += e.winningBid / tile.price;
              priceRatioCount++;
            }
          }
          break;
        case 'PAYMENT_MADE':
          if (e.reason === 'yield') {
            yieldPayments++;
            if (e.capped) {
              capped++;
              withheld += e.requested - e.paid;
            }
          }
          break;
        case 'DEBT_INCURRED':
          debtBalance[e.player] = (debtBalance[e.player] ?? 0) + e.amount;
          peak[e.player] = Math.max(peak[e.player] ?? 0, debtBalance[e.player] ?? 0);
          break;
        case 'INTEREST_ACCRUED':
          interest += e.amount;
          debtBalance[e.player] = (debtBalance[e.player] ?? 0) + e.amount;
          peak[e.player] = Math.max(peak[e.player] ?? 0, debtBalance[e.player] ?? 0);
          break;
        case 'DEBT_REPAID':
          debtBalance[e.player] = (debtBalance[e.player] ?? 0) - e.amount;
          break;
        case 'LEVERAGE_TOKEN_GRANTED':
          granted++;
          break;
        case 'LEVERAGE_TOKEN_USED':
          used++;
          useByKind[e.payload.kind] = (useByKind[e.payload.kind] ?? 0) + 1;
          break;
        case 'CITY_PULSE_REROLLED':
          rerolls++;
          break;
        default:
          break;
      }
    }
    for (const p of s.players) {
      if ((peak[p.id] ?? 0) > 0) playersInDebt++;
      peakDebtSum += peak[p.id] ?? 0;
    }

    let setsHere = 0;
    for (const c of PROPERTY_CATEGORIES) {
      const owners = categoryTiles(s.board, c).map((i) => s.ownership[i]);
      if (owners[0] !== undefined && owners.every((o) => o === owners[0])) setsHere++;
    }
    sets += setsHere;
    if (setsHere > 0) matchesWithSet++;

    const worths = s.players.map((p) => ({ id: p.id, seat: p.seat, nw: computeNetWorth(s, p.id) }));
    const max = Math.max(...worths.map((w) => w.nw));
    const min = Math.min(...worths.map((w) => w.nw));
    spread += max - min;
    const winner = worths.find((w) => w.nw === max)!;
    winsBySeat[winner.seat] = (winsBySeat[winner.seat] ?? 0) + 1;

    const r6 = rec.netWorthByRound[6];
    if (r6) {
      const r6Max = Math.max(...Object.values(r6));
      // Ties resolved in seat order, matching the engine's final ranking.
      const r6Leader = rec.seatOrder.find((id) => r6[id] === r6Max);
      if (r6Leader !== winner.id) leaderChanged++;
    }

    const owned = Object.keys(s.ownership).length;
    ownedAtEnd += owned;
    unownedAtEnd += 18 - owned;
  }

  return {
    matches: n,
    players: playerCount,
    avgTurnSeconds: turnSeconds / n,
    avgMatchMinutes: turnSeconds / n / 60,
    avgCommands: commands / n,
    avgTimeouts: timeouts / n,
    avgAuctions: auctions / n,
    zeroBidAuctionRate: auctions === 0 ? 0 : zeroBid / auctions,
    avgAuctionPriceToList: priceRatioCount === 0 ? null : priceRatioSum / priceRatioCount,
    avgYieldPayments: yieldPayments / n,
    cappedPaymentRate: yieldPayments === 0 ? 0 : capped / yieldPayments,
    avgCreditsWithheldByCap: withheld / n,
    playersEverInDebtRate: playersInDebt / (n * playerCount),
    avgPeakDebt: peakDebtSum / (n * playerCount),
    avgInterestPaid: interest / n,
    avgLeverageGranted: granted / n,
    avgLeverageUsed: used / n,
    leverageUseByKind: useByKind,
    avgPulseRerolls: rerolls / n,
    avgCompleteSets: sets / n,
    matchesWithAnySetRate: matchesWithSet / n,
    avgNetWorthSpread: spread / n,
    leaderChangedAfterRound6Rate: leaderChanged / n,
    winRateBySeat: winsBySeat.map((w) => w / n),
    avgPropertiesOwnedAtEnd: ownedAtEnd / n,
    avgUnownedAtEnd: unownedAtEnd / n,
  };
}

export function formatMetrics(m: BatchMetrics): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const rows: [string, string][] = [
    ['Matches', `${m.matches} × ${m.players} players`],
    ['Simulated match length', `${m.avgMatchMinutes.toFixed(1)} min (${m.avgTurnSeconds.toFixed(0)} s)`],
    ['Commands / match', m.avgCommands.toFixed(1)],
    ['Timeouts / match', m.avgTimeouts.toFixed(2)],
    ['Auctions / match', `${m.avgAuctions.toFixed(2)} (zero-bid ${pct(m.zeroBidAuctionRate)})`],
    ['Auction price / list', m.avgAuctionPriceToList === null ? 'n/a' : m.avgAuctionPriceToList.toFixed(2)],
    ['Yield payments / match', `${m.avgYieldPayments.toFixed(1)} (capped ${pct(m.cappedPaymentRate)}, ₵${m.avgCreditsWithheldByCap.toFixed(0)} withheld)`],
    ['Players ever in debt', pct(m.playersEverInDebtRate)],
    ['Peak debt / player', `₵${m.avgPeakDebt.toFixed(0)}`],
    ['Interest paid / match', `₵${m.avgInterestPaid.toFixed(0)}`],
    ['Leverage granted / used', `${m.avgLeverageGranted.toFixed(2)} / ${m.avgLeverageUsed.toFixed(2)} ${JSON.stringify(m.leverageUseByKind)}`],
    ['Pulse rerolls / match', m.avgPulseRerolls.toFixed(2)],
    ['Complete sets / match', `${m.avgCompleteSets.toFixed(2)} (any set in ${pct(m.matchesWithAnySetRate)} of matches)`],
    ['Properties owned at end', `${m.avgPropertiesOwnedAtEnd.toFixed(1)} of 18`],
    ['Net Worth spread', `₵${m.avgNetWorthSpread.toFixed(0)}`],
    ['Leader changed after R6', pct(m.leaderChangedAfterRound6Rate)],
    ['Win rate by seat', m.winRateBySeat.map(pct).join(' / ')],
  ];
  const w = Math.max(...rows.map(([k]) => k.length));
  return rows.map(([k, v]) => `${k.padEnd(w)}  ${v}`).join('\n');
}
