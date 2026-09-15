/**
 * Player identity (cosmetic): colour + symbol + initial by seat. Never colour alone.
 * Palette per spec §2.1 / §7: seat 1 Crimson ■, 2 Azure ●, 3 Emerald ▲, 4 Violet ◆
 * (the same hexes are declared as --player-1..4 in theme.css).
 */

import type { PlayerId, PlayerView } from '../engine.ts';
import { h } from './dom.ts';

export const SEAT_COLOURS = ['#E5484D', '#22A6F0', '#2FBF71', '#9B6DFF'];
export const SEAT_SYMBOLS = ['■', '●', '▲', '◆'];

export interface Identity {
  readonly colour: string;
  readonly symbol: string;
  readonly initial: string;
  readonly name: string;
}

export function identityOf(view: PlayerView, id: PlayerId | null): Identity {
  const p = id === null ? undefined : view.state.players.find((x) => x.id === id);
  if (!p) return { colour: '#666', symbol: '?', initial: '?', name: '—' };
  return {
    colour: SEAT_COLOURS[p.seat % SEAT_COLOURS.length] ?? '#666',
    symbol: SEAT_SYMBOLS[p.seat % SEAT_SYMBOLS.length] ?? '●',
    initial: (p.displayName.trim()[0] ?? '?').toUpperCase(),
    name: p.displayName,
  };
}

export function token(view: PlayerView, id: PlayerId, opts: { size?: 'sm' | 'md' | 'lg'; withName?: boolean } = {}): HTMLElement {
  const me = identityOf(view, id);
  const t = h('span', { class: `token ${opts.size ?? 'md'}`, style: `--c:${me.colour}`, title: me.name }, `${me.symbol} ${me.initial}`);
  return opts.withName ? h('span', { class: 'token-name' }, t, ' ', me.name) : t;
}

export function nameOf(view: PlayerView, id: PlayerId | null): string {
  return identityOf(view, id).name;
}
