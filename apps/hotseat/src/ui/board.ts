/**
 * Board — the 24 tiles drawn as a hexagonal ring (radius 4, four tiles per
 * side, District Hub at the top, clockwise). Tile order, identities and every
 * displayed value come from the engine; the ring is only where they are drawn.
 *
 * DOM:
 *   section.card.board-card
 *     h2
 *     div.ring
 *       div.ring-centre        slot for the action panel (CSS decides placement)
 *       div.ring-stage         fixed-aspect box: 14s × 15.59s
 *         div.rail             decorative SVG: loop line, clockwise chevrons, tile numbers
 *         div.parcels          24 keyed parcels (stable identity via reconcile)
 */

import { tileName } from '../engine.ts';
import type { Tile } from '../engine.ts';
import type { Snapshot } from '../host.ts';
import { RING, RING_HEIGHT, RING_WIDTH, outward, ringPosition } from './board-geometry.ts';
import { h, reconcile } from './dom.ts';
import { renderParcel } from './parcel.ts';

/** Short label used by other panels (unchanged from the grid board). */
export function tileLabel(t: Tile): string {
  return t.kind === 'property' ? `${tileName(t)} · ${t.category.slice(0, 3).toUpperCase()} T${t.tier}` : tileName(t).toUpperCase();
}

/** Decorative rail: closed loop through the 24 centres, six clockwise chevrons, tile numbers outside. Static, computed once. */
function railMarkup(): string {
  const half = { x: RING_WIDTH / 2, y: RING_HEIGHT / 2 };
  const pts = RING.map((c) => `${c.x.toFixed(3)},${c.y.toFixed(3)}`).join(' ');
  const chevrons = [0, 1, 2, 3, 4, 5]
    .map((side) => {
      const a = ringPosition(side * 4 + 1);
      const b = ringPosition(side * 4 + 2);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      return `<polygon points="-0.22,-0.16 0.14,0 -0.22,0.16" transform="translate(${mx.toFixed(3)} ${my.toFixed(3)}) rotate(${ang.toFixed(1)})" class="chevron"/>`;
    })
    .join('');
  const numbers = RING.map((c) => {
    const o = outward(c);
    const reach = c.index === 0 ? 1.45 : c.corner ? 1.25 : 1.12; // Hub is drawn 20 % larger
    const nx = c.x + o.x * reach;
    const ny = c.y + o.y * reach;
    return `<text x="${nx.toFixed(3)}" y="${ny.toFixed(3)}" class="tile-no">${c.index}</text>`;
  }).join('');
  return `<svg viewBox="${-half.x} ${-half.y} ${RING_WIDTH} ${RING_HEIGHT}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">` +
    `<polygon points="${pts}" class="loop"/>${chevrons}${numbers}</svg>`;
}

const RAIL_MARKUP = railMarkup();

/**
 * @param centre  element to place in the ring's centre slot (the action panel);
 *                CSS positions it inside the ring at ≥ 1200 px and above it below that.
 */
export function renderBoard(snap: Snapshot, centre: HTMLElement | null): HTMLElement {
  const view = snap.view!;
  const s = view.state;
  const me = snap.keyboard!;

  const rail = h('div', { class: 'rail' });
  rail.innerHTML = RAIL_MARKUP; // static geometry only; no user or game content

  const parcels = h('div', { class: 'parcels' });
  reconcile(parcels, s.board, (t) => String(t.index), (t, existing) => renderParcel(t, { view, me, cell: ringPosition(t.index) }, existing));

  const stage = h('div', { class: 'ring-stage' }, rail, parcels);
  const slot = h('div', { class: 'ring-centre' });
  if (centre) slot.append(centre);

  return h(
    'section',
    { class: 'card board-card' },
    h('h2', {}, 'District ', h('span', { class: 'muted small' }, '— clockwise from the Hub at the top; your properties are marked YOU')),
    h('div', { class: 'ring' }, slot, stage),
  );
}
