/**
 * The fixed 24-tile board — Paper Playtest Kit Part 1, transcribed exactly.
 * Specials sit at 0, 4, 8, 12, 16, 20. No procedural generation.
 */

import { TIER_PRICE, TIER_YIELD, BOARD_TILE_COUNT, PROPERTY_TILE_COUNT } from './constants.ts';
import type { Board, Category, PropertyTile, Tile, Tier, TileIndex } from './types.ts';

function property(index: TileIndex, name: string, category: Category, tier: Tier): PropertyTile {
  return { kind: 'property', index, name, category, tier, price: TIER_PRICE[tier], baseYield: TIER_YIELD[tier] };
}

export const BOARD: Board = [
  { kind: 'district_hub', index: 0 },
  property(1, 'Kestrel Row', 'Residential', 1),
  property(2, 'Quanta Campus', 'Tech', 2),
  property(3, 'Neon Arcade', 'Leisure', 1),
  { kind: 'pulse_relay', index: 4 },
  property(5, 'Foundry Yard', 'Industry', 1),
  property(6, 'Helix Reactor', 'Energy', 3),
  property(7, 'Tram Depot', 'Transit', 1),
  { kind: 'audit', index: 8 },
  property(9, 'Vireo Terraces', 'Residential', 2),
  property(10, 'Lattice Labs', 'Tech', 1),
  property(11, 'Aurora Colosseum', 'Leisure', 3),
  { kind: 'pulse_relay', index: 12 },
  property(13, 'Ironworks Mile', 'Industry', 2),
  property(14, 'Solar Flats', 'Energy', 1),
  property(15, 'Skyrail Junction', 'Transit', 2),
  { kind: 'exchange', index: 16 },
  property(17, 'Halcyon Heights', 'Residential', 3),
  property(18, 'Cortex Tower', 'Tech', 3),
  property(19, 'Skyline Gardens', 'Leisure', 2),
  { kind: 'windfall', index: 20 },
  property(21, 'Titan Docks', 'Industry', 3),
  property(22, 'Fusion Spur', 'Energy', 2),
  property(23, 'Orbital Gate', 'Transit', 3),
];

export const DISTRICT_HUB_INDEX: TileIndex = 0;

/** Human-readable name for any tile. */
export function tileName(tile: Tile): string {
  switch (tile.kind) {
    case 'property':
      return tile.name;
    case 'district_hub':
      return 'District Hub';
    case 'pulse_relay':
      return 'Pulse Relay';
    case 'audit':
      return 'Audit';
    case 'exchange':
      return 'Exchange';
    case 'windfall':
      return 'Windfall';
  }
}

/** Indices of all property tiles in a category (always three). */
export function categoryTiles(board: Board, category: Category): TileIndex[] {
  return board.filter((t): t is PropertyTile => t.kind === 'property' && t.category === category).map((t) => t.index);
}

// Structural sanity, evaluated once at module load.
if (BOARD.length !== BOARD_TILE_COUNT) throw new Error('BOARD must have 24 tiles');
if (BOARD.filter((t) => t.kind === 'property').length !== PROPERTY_TILE_COUNT) throw new Error('BOARD must have 18 properties');
BOARD.forEach((t, i) => {
  if (t.index !== i) throw new Error(`BOARD tile ${i} has index ${t.index}`);
});
