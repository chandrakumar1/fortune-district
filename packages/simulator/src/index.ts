/**
 * @fortune-district/simulator — public entry point.
 */

export type { Bot, BotKind, AuctionView } from './bots.ts';
export { createBot, RandomBot, PassiveBot, GreedyBot, TimeoutBot } from './bots.ts';
export { runMatch, replay } from './runner.ts';
export type { MatchRecord, RunOptions } from './runner.ts';
export { runBatch, checkDeterminism, botsFor, playersFor } from './batch.ts';
export type { BatchOptions } from './batch.ts';
export { computeMetrics, formatMetrics } from './metrics.ts';
export type { BatchMetrics } from './metrics.ts';
export { computeEndgameMetrics, formatEndgameMetrics, rankingAt, leaderAt, finalRanking } from './endgame.ts';
export type { EndgameMetrics, RoundActivity } from './endgame.ts';
export { computeSeatStats, formatSeatStats } from './seats.ts';
export type { SeatStats, GroupBy } from './seats.ts';
