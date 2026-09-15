/**
 * One hex parcel (property or special tile). Presentation only: every value is
 * read from the engine's state or its exported helpers; nothing is written.
 *
 * DOM (two nested hexes so a "border" survives clip-path):
 *   div.parcel[data-key=i]           absolutely positioned by ring geometry
 *     div.hex-outer                  ring colour: owner / YOU accent / for-sale
 *       div.hex-inner                fill: category tint or special dusk
 *         div.ribbon                 owner (YOU / name) or "for sale"
 *         div.name                   tile name
 *         div.tag                    category code + tier pips
 *         div.micro                  price/base or yield/upgrade pips
 *         div.pawns                  player tokens whose position is this tile
 */

import { MAX_UPGRADE_LEVEL, tileName, yieldFor } from '../engine.ts';
import type { PlayerId, PlayerView, Tile } from '../engine.ts';
import { h, money } from './dom.ts';
import { specialHint } from './copy.ts';
import { identityOf, token } from './theme.ts';
import type { RingCell } from './board-geometry.ts';

const CATEGORY_CODE: Readonly<Record<string, string>> = {
  Residential: 'RES',
  Tech: 'TEC',
  Leisure: 'LEI',
  Industry: 'IND',
  Energy: 'ENE',
  Transit: 'TRA',
};

/** On-tile abbreviations of the kit's tile-column effects; the full sentence stays in the tooltip. */
const SPECIAL_SHORT: Readonly<Record<string, string>> = {
  district_hub: '+₵150 pass/land',
  pulse_relay: 'reroll next Pulse',
  audit: 'pay 8% of cash',
  exchange: '1 upgrade −20%',
  windfall: '+₵100 · +₵250 if last',
};

/** CSS custom-property name for a category's tint (declared in assets/theme.css). */
function tintVar(category: string): string {
  return `var(--cat-${(CATEGORY_CODE[category] ?? 'res').toLowerCase()})`;
}

export function tierPips(tier: number): string {
  return '▮'.repeat(tier) + '▯'.repeat(Math.max(0, 3 - tier));
}

export function upgradePips(level: number): string {
  return '◆'.repeat(level) + '◇'.repeat(Math.max(0, MAX_UPGRADE_LEVEL - level));
}

export interface ParcelContext {
  readonly view: PlayerView;
  /** Keyboard holder: their parcels read YOU. */
  readonly me: PlayerId;
  readonly cell: RingCell;
}

/** Build (or refresh in place) the parcel element for `tile`. */
export function renderParcel(tile: Tile, ctx: ParcelContext, existing: HTMLElement | null): HTMLElement {
  const { view, me, cell } = ctx;
  const s = view.state;
  const owner = s.ownership[tile.index];
  const mine = owner === me;
  const level = s.upgrades[tile.index] ?? 0;
  const here = s.players.filter((p) => p.position === tile.index);

  const classes = ['parcel', tile.kind, tile.kind === 'property' ? 'property' : 'special'];
  if (owner !== undefined) classes.push('owned');
  if (mine) classes.push('mine');
  if (cell.corner) classes.push('corner');
  if (tile.kind === 'district_hub') classes.push('hub');
  if (here.some((p) => p.id === me)) classes.push('here');

  const styleParts = [`--x:${cell.x.toFixed(4)}`, `--y:${cell.y.toFixed(4)}`];
  if (owner !== undefined) styleParts.push(`--owner:${identityOf(view, owner).colour}`);
  if (tile.kind === 'property') styleParts.push(`--tint:${tintVar(tile.category)}`);

  // Content
  const inner = h('div', { class: 'hex-inner' });
  if (owner !== undefined) {
    const o = identityOf(view, owner);
    inner.append(h('div', { class: 'ribbon' }, `${o.symbol} ${mine ? 'YOU' : o.name}`));
  } else {
    inner.append(h('div', { class: 'ribbon empty' }, tile.kind === 'property' ? 'for sale' : ''));
  }
  inner.append(h('div', { class: 'name' }, tileName(tile)));
  if (tile.kind === 'property') {
    inner.append(h('div', { class: 'tag' }, `${CATEGORY_CODE[tile.category] ?? ''} ${tierPips(tile.tier)}`));
    // Kit column style "price / yield" for unowned; "yield ◆◇" (current yield, upgrade pips) when owned.
    inner.append(
      owner !== undefined
        ? h('div', { class: 'micro' }, `${money(yieldFor(s, tile.index))} ${upgradePips(level)}`)
        : h('div', { class: 'micro' }, `${money(tile.price)} / ${money(tile.baseYield)}`),
    );
  } else {
    inner.append(h('div', { class: 'micro' }, SPECIAL_SHORT[tile.kind] ?? specialHint(tile)));
  }
  if (here.length) inner.append(h('div', { class: 'pawns' }, ...here.map((p) => token(view, p.id, { size: 'sm' }))));

  const title =
    tile.kind === 'property'
      ? `#${tile.index} ${tileName(tile)} · ${tile.category} · tier ${tile.tier} · price ${money(tile.price)} · base yield ${money(tile.baseYield)}` +
        (owner !== undefined ? ` · owned by ${mine ? 'you' : identityOf(view, owner).name} · level ${level} · current yield ${money(yieldFor(s, tile.index))}` : ' · unowned')
      : `#${tile.index} ${tileName(tile)} · ${specialHint(tile)}`;

  const outer = h('div', { class: 'hex-outer' }, inner);
  const el = existing ?? h('div', {});
  el.setAttribute('class', classes.join(' '));
  el.setAttribute('style', styleParts.join(';'));
  el.setAttribute('title', title);
  el.setAttribute('data-index', String(tile.index));
  el.replaceChildren(outer);
  return el;
}
