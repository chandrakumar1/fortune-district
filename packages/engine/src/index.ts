/**
 * @fortune-district/engine — public entry point.
 *
 * Pure, deterministic rules engine for Fortune District v0.1 (Paper Playtest
 * Kit rules + locked decisions; see docs/GAME_DESIGN_v0.1.md).
 */

export * from './constants.ts';
export type * from './types.ts';
export { RULINGS } from './rulings.ts';
export { BOARD, DISTRICT_HUB_INDEX, tileName, categoryTiles } from './board.ts';
export { createRng, nextInt, rollDie, rollTwoDice, rawDraw, shuffle } from './rng.ts';
export { fraction } from './money.ts';
export { yieldFor, ownsFullSet, pulseFactor } from './internal.ts';
export { minimumBidFor, forwardDistanceToHub } from './auction.ts';
export {
  createInitialState,
  applyCommand,
  legalCommands,
  whoseDecision,
  computeNetWorth,
  projectForPlayer,
  hashState,
  upgradeCost,
  activePlayer,
} from './engine.ts';
