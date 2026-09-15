import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BOARD } from '../src/engine.ts';
import {
  CENTRE_SLOT_HEIGHT,
  CENTRE_SLOT_WIDTH,
  RING,
  RING_RADIUS,
  RING_SIZE,
  SQRT3,
  areNeighbours,
  hexDistance,
  ringPosition,
} from '../src/ui/board-geometry.ts';

test('geometry: 24 unique cells, every one at hex distance 4 from the centre', () => {
  assert.equal(RING_SIZE, 24);
  assert.equal(RING.length, 24);
  const keys = new Set(RING.map((c) => `${c.q},${c.r}`));
  assert.equal(keys.size, 24);
  for (const c of RING) assert.equal(hexDistance(c.q, c.r), RING_RADIUS, `tile ${c.index}`);
  assert.deepEqual(RING.map((c) => c.index), Array.from({ length: 24 }, (_, i) => i));
});

test('geometry: consecutive tiles are neighbours and 23 connects back to 0', () => {
  for (let i = 0; i < 24; i++) {
    const a = ringPosition(i);
    const b = ringPosition((i + 1) % 24);
    assert.ok(areNeighbours(a, b), `tiles ${i} and ${(i + 1) % 24} must be adjacent`);
  }
  // Only the two ring neighbours are adjacent — the loop has no shortcuts.
  for (let i = 0; i < 24; i++) {
    const adj = RING.filter((c) => c.index !== i && areNeighbours(ringPosition(i), c)).map((c) => c.index).sort((x, y) => x - y);
    assert.deepEqual(adj, [(i + 23) % 24, (i + 1) % 24].sort((x, y) => x - y), `tile ${i} neighbours`);
  }
});

test('geometry: corners are exactly the indices divisible by 4, which are exactly the engine\'s special tiles', () => {
  for (let i = 0; i < 24; i++) {
    const isCorner = ringPosition(i).corner;
    assert.equal(isCorner, i % 4 === 0, `tile ${i} corner flag`);
    assert.equal(isCorner, BOARD[i]!.kind !== 'property', `tile ${i}: corner ⇔ special`);
  }
  assert.deepEqual(RING.filter((c) => c.corner).map((c) => c.index), [0, 4, 8, 12, 16, 20]);
  assert.equal(BOARD[0]!.kind, 'district_hub');
});

test('geometry: tile 0 is the top apex and the ring runs clockwise', () => {
  const hub = ringPosition(0);
  assert.equal(hub.x, 0);
  for (const c of RING) assert.ok(c.y >= hub.y, `tile ${c.index} is not above the Hub`);
  assert.equal(RING.filter((c) => c.y === hub.y).length, 1, 'the Hub alone is at the top');
  // Screen angle (y down) measured from the Hub increases monotonically → clockwise.
  const angle = (c: { x: number; y: number }) => {
    const a = Math.atan2(c.y, c.x) + Math.PI / 2; // 0 at the top
    return a < 0 ? a + 2 * Math.PI : a;
  };
  for (let i = 1; i < 24; i++) assert.ok(angle(ringPosition(i)) > angle(ringPosition(i - 1)), `tile ${i} is not clockwise of tile ${i - 1}`);
  // Tile 1 is up-right of the Hub, tile 23 up-left: symmetric start.
  assert.ok(ringPosition(1).x > 0 && ringPosition(23).x < 0);
  assert.equal(ringPosition(1).y, ringPosition(23).y);
});

test('geometry: pure and deterministic; bounds match the documented box; centre slot is clear of every cell', () => {
  assert.deepEqual(ringPosition(7), ringPosition(7));
  assert.throws(() => ringPosition(24), RangeError);
  assert.throws(() => ringPosition(-1), RangeError);
  const xs = RING.map((c) => c.x);
  const ys = RING.map((c) => c.y);
  assert.equal(Math.max(...xs), 6);
  assert.equal(Math.min(...xs), -6);
  assert.ok(Math.abs(Math.max(...ys) - 4 * SQRT3) < 1e-9);
  // Centre slot (axis-aligned, centred) must not overlap any hex: test the slot's
  // corners and edge midpoints against every cell's bounding hex (flat-top, s = 1).
  const inside = (px: number, py: number, c: { x: number; y: number }) => {
    const dx = Math.abs(px - c.x);
    const dy = Math.abs(py - c.y);
    // Flat-top hexagon with circumradius 1: |dy| ≤ √3/2 and |dx| ≤ 1 − |dy|/√3.
    return dy <= SQRT3 / 2 + 1e-9 && dx <= 1 - dy / SQRT3 + 1e-9;
  };
  const w = CENTRE_SLOT_WIDTH / 2;
  const hh = CENTRE_SLOT_HEIGHT / 2;
  // Sample the whole perimeter of the slot (200 points per edge).
  const probes: [number, number][] = [];
  for (let i = 0; i <= 200; i++) {
    const t = -1 + (2 * i) / 200;
    probes.push([t * w, -hh], [t * w, hh], [-w, t * hh], [w, t * hh]);
  }
  for (const [px, py] of probes) for (const c of RING) assert.ok(!inside(px, py, c), `slot point (${px.toFixed(2)},${py.toFixed(2)}) overlaps tile ${c.index}`);
  // And the slot is not trivially small: it is the box the CSS uses.
  assert.ok(CENTRE_SLOT_WIDTH >= 6 && CENTRE_SLOT_HEIGHT >= 7.5);
});
