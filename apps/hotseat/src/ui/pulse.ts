/** City Pulse panel. */

import type { PlayerView } from '../engine.ts';
import { h } from './dom.ts';

export function renderPulse(view: PlayerView): HTMLElement {
  const cp = view.state.cityPulse;
  const fmt = (e: { round: number; boosted: string; suppressed: string }) => `${e.boosted} earn ×1.5 · ${e.suppressed} earn ×0.6`;
  return h('section', { class: 'card' },
    h('h2', {}, 'City Pulse'),
    h('div', {}, h('span', { class: 'muted' }, 'Active now: '), cp.active ? h('strong', {}, fmt(cp.active)) : h('span', { class: 'muted' }, 'none yet (first at round 4)')),
    h('div', {}, h('span', { class: 'muted' }, 'Coming next: '), cp.telegraphed.length ? h('strong', {}, cp.telegraphed.map((e) => `round ${e.round}: ${fmt(e)}`).join('; ')) : h('span', { class: 'muted' }, 'announced one round ahead')),
  );
}
