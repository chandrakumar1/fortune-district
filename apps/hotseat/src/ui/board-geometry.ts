/**
 * Hex-ring geometry for the 24-tile board — a pure function of the engine's
 * tile index. Nothing here reads or writes game state.
 *
 * Ring of radius 4 in axial coordinates (q, r), flat-top hexes: 6 sides × 4
 * tiles = 24 cells. Side s = ⌊i/4⌋ starts at corner C[s] and walks k = i mod 4
 * steps in direction D[s], clockwise. Because the engine's specials are the
 * indices divisible by 4, they fall exactly on the six corners; tile 0 (the
 * District Hub) is the top apex.
 *
 * Pixel mapping (flat-top, unit hex circumradius s = 1):
 *   x = 1.5·q          y = √3·(r + q/2)
 * so the ring spans x ∈ [−7, 7] and y ∈ [−7.79, 7.79] in units of s.
 */

export const RING_RADIUS = 4;
export const RING_SIZE = 6 * RING_RADIUS; // 24
export const SQRT3 = Math.sqrt(3);

/** Ring bounding box in units of the hex circumradius. */
export const RING_WIDTH = 14; // (6 + 1) × 2
export const RING_HEIGHT = 9 * SQRT3; // ≈ 15.59

/**
 * Inscribed rectangle for the centre slot, in units of s. The free region is a
 * pointy-top hexagon whose slanted inner edges run from (±0.5, ∓6.06) to
 * (±5.5, ∓2.6); at half-width 3.1 the free half-height is ≈ 3.98, so a
 * 6.2 × 7.9 box stays clear of every ring cell (proved by the geometry test).
 */
export const CENTRE_SLOT_WIDTH = 6.2;
export const CENTRE_SLOT_HEIGHT = 7.9;

const CORNERS: readonly (readonly [number, number])[] = [
  [0, -4],
  [4, -4],
  [4, 0],
  [0, 4],
  [-4, 4],
  [-4, 0],
];
const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
];

export interface RingCell {
  readonly index: number;
  readonly q: number;
  readonly r: number;
  /** Centre in units of s, relative to the ring centre; +x right, +y down. */
  readonly x: number;
  readonly y: number;
  /** 0..5, the side of the big hexagon this tile lies on. */
  readonly side: number;
  /** 0..3, steps past the side's corner. */
  readonly k: number;
  /** True for the six corner cells (index divisible by 4). */
  readonly corner: boolean;
}

export function ringPosition(index: number): RingCell {
  if (!Number.isInteger(index) || index < 0 || index >= RING_SIZE) throw new RangeError(`tile index out of range: ${index}`);
  const side = Math.floor(index / RING_RADIUS);
  const k = index % RING_RADIUS;
  const c = CORNERS[side] as readonly [number, number];
  const d = DIRS[side] as readonly [number, number];
  const q = c[0] + k * d[0];
  const r = c[1] + k * d[1];
  return { index, q, r, x: 1.5 * q, y: SQRT3 * (r + q / 2), side, k, corner: k === 0 };
}

export const RING: readonly RingCell[] = Array.from({ length: RING_SIZE }, (_, i) => ringPosition(i));

export function hexDistance(q: number, r: number): number {
  return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
}

export function areNeighbours(a: RingCell, b: RingCell): boolean {
  return hexDistance(a.q - b.q, a.r - b.r) === 1;
}

/** Unit vector from the ring centre through a cell's centre (for outward labels/chevrons). */
export function outward(cell: RingCell): { readonly x: number; readonly y: number } {
  const len = Math.hypot(cell.x, cell.y) || 1;
  return { x: cell.x / len, y: cell.y / len };
}
