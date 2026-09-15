/**
 * "What just happened" / "Since your last turn" recap card (spec §3 Event/Recap
 * Card): up to six plain-language lines, each with a small icon and a tone;
 * money deltas summarised as coloured chips. All content derives from
 * Snapshot.recentEvents.
 */

import type { PlayerId } from '../engine.ts';
import type { Snapshot } from '../host.ts';
import { h, money } from './dom.ts';
import { concerns, tellMe } from './copy.ts';
import { moneyDelta, recapMeta } from './deltas.ts';

/** Signed money chip, e.g. "+₵150" in gain colour or "−₵50" in loss colour. */
export function deltaChip(label: string, amount: number, invert = false): HTMLElement | null {
  if (amount === 0) return null;
  const good = invert ? amount < 0 : amount > 0;
  const sign = amount > 0 ? '+' : '−';
  return h('span', { class: `chip delta ${good ? 'gain' : 'loss'}` }, `${label} ${sign}${money(Math.abs(amount))}`);
}

/** What happened (own action) or since your last turn (hand-off). */
export function renderRecap(snap: Snapshot, me: PlayerId, handoff: boolean): HTMLElement | null {
  const view = snap.view!;
  const relevant = snap.recentEvents.filter((e) => concerns(e, me) && e.type !== 'ROUND_ENDED');
  const items = relevant
    .map((e) => ({ text: tellMe(e, view, me), meta: recapMeta(e, me) }))
    .filter((x): x is { text: string; meta: ReturnType<typeof recapMeta> } => x.text !== null);
  if (items.length === 0) return null;

  const d = moneyDelta(snap.recentEvents, me);
  const chips = [deltaChip('Cash', d.cash), deltaChip('Debt', d.debt, true), d.credit ? h('span', { class: 'chip delta info' }, `Credit line +${money(d.credit)}`) : null].filter(Boolean) as HTMLElement[];

  return h(
    'div',
    { class: 'recap' },
    h('div', { class: 'recap-title' }, handoff ? 'Since your last turn' : 'What just happened'),
    h('ul', {}, ...items.slice(-6).map((it) => h('li', { class: `tone-${it.meta.tone}` }, h('span', { class: 'recap-icon' }, it.meta.icon), h('span', {}, it.text)))),
    chips.length ? h('div', { class: 'recap-chips' }, ...chips) : null,
  );
}
