/**
 * Status bar (spec §3): round with a 12-segment rail (Pulse rounds 4/7/10
 * marked), the active player's token with the timer ring, "X's turn · what
 * to do", and the timer in tabular seconds. Shown once per screen; the action
 * panel mirrors only the token+ring.
 */

import { CITY_PULSE_ROUNDS, ROUND_COUNT } from '../engine.ts';
import type { Snapshot } from '../host.ts';
import { h } from './dom.ts';
import { stepLabel } from './copy.ts';
import { nameOf, token } from './theme.ts';
import { renderRulesButton } from './rules-card.ts';

export function timerText(snap: Snapshot): string {
  if (!snap.timer) return 'no timer';
  return `${Math.ceil(snap.timer.remainingMs / 1000)} s`;
}

/** 'ok' | 'warn' (< 10 s) | 'loss' (< 5 s) | 'off'. */
export function timerState(snap: Snapshot): 'ok' | 'warn' | 'loss' | 'off' {
  if (!snap.timer) return 'off';
  const s = snap.timer.remainingMs / 1000;
  return s < 5 ? 'loss' : s < 10 ? 'warn' : 'ok';
}

/** Fraction of the decision window remaining, 0..1 (1 when no timer). */
export function timerFraction(snap: Snapshot): number {
  if (!snap.timer || snap.timer.totalMs <= 0) return 1;
  return Math.max(0, Math.min(1, snap.timer.remainingMs / snap.timer.totalMs));
}

export function timerEl(snap: Snapshot): HTMLElement {
  const state = timerState(snap);
  return h('span', { class: `timer ${state}` }, '⏱ ', h('span', { class: 'timer-value' }, timerText(snap)));
}

/**
 * The active player's token wrapped in a 4 px ring that drains with the timer.
 * `--frac` is updated on every tick by render.ts without a re-render.
 */
export function activeToken(snap: Snapshot, size: 'md' | 'lg' = 'md'): HTMLElement {
  const view = snap.view!;
  const me = snap.keyboard!;
  const state = timerState(snap);
  return h('span', { class: `timer-ring ${state}`, style: `--frac:${timerFraction(snap).toFixed(3)}` }, token(view, me, { size }));
}

function roundRail(round: number): HTMLElement {
  const segs: HTMLElement[] = [];
  for (let r = 1; r <= ROUND_COUNT; r++) {
    const pulse = (CITY_PULSE_ROUNDS as readonly number[]).includes(r);
    const cls = ['seg', r < round ? 'done' : r === round ? 'now' : '', pulse ? 'pulse' : ''].filter(Boolean).join(' ');
    segs.push(h('span', { class: cls, title: pulse ? `Round ${r}: City Pulse` : `Round ${r}` }, pulse ? '◉' : ''));
  }
  return h('span', { class: 'round-rail' }, ...segs);
}

export function renderStatusBar(snap: Snapshot): HTMLElement {
  const view = snap.view!;
  const s = view.state;
  const me = snap.keyboard!;
  return h(
    'header',
    { class: 'statusbar' },
    h('div', { class: 'round' }, h('strong', {}, `Round ${s.round}`), h('span', { class: 'muted' }, ` / ${ROUND_COUNT}`), roundRail(s.round)),
    h('div', { class: 'whose' }, activeToken(snap, 'md'), h('span', { class: 'whose-text' }, h('strong', {}, `${nameOf(view, me)}'s turn`), h('span', { class: 'muted' }, ` · ${stepLabel(snap)}`))),
    h('div', { class: 'bar-right' }, timerEl(snap), renderRulesButton(snap.config)),
  );
}
