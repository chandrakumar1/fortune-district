/**
 * First-time callouts (spec §11): six one-off, dismissible notes anchored in
 * the action panel, each shown once per browser. Triggers are read from the
 * current step and Snapshot.recentEvents; nothing here is a rule.
 */

import { EXCHANGE_PAY_DENOMINATOR, EXCHANGE_PAY_NUMERATOR, WINDFALL_AMOUNT, WINDFALL_AMOUNT_IF_LAST } from '../engine.ts';
import type { PlayerId } from '../engine.ts';
import type { Snapshot } from '../host.ts';
import { h, money } from './dom.ts';
import { TERMS } from './copy.ts';

export const CALLOUT_STORAGE_KEY = 'fortune-district.callouts.v1';

export type CalloutId = 'for_sale' | 'yield' | 'debt' | 'leverage' | 'pulse' | 'special';

export const CALLOUTS: Readonly<Record<CalloutId, { readonly title: string; readonly text: string }>> = {
  for_sale: { title: 'First property for sale', text: 'Buying makes this parcel yours: opponents who land here pay you its yield. Sending it to auction lets everyone (including you) bid in secret.' },
  yield: { title: 'First yield', text: `Landing on an opponent's property pays them its yield. ${TERMS.cap}` },
  debt: { title: 'First debt', text: TERMS.debt },
  leverage: { title: 'First Leverage token', text: TERMS.Leverage },
  pulse: { title: 'First City Pulse', text: TERMS.Pulse },
  special: { title: 'Special tiles', text: `Landing on a special tile acts at once. Exchange: one upgrade at ${100 - Math.round((EXCHANGE_PAY_NUMERATOR / EXCHANGE_PAY_DENOMINATOR) * 100)}% off this turn. Windfall: +${money(WINDFALL_AMOUNT)}, or +${money(WINDFALL_AMOUNT_IF_LAST)} if you are last. Pulse Relay: reroll the next City Pulse, or keep it.` },
};

// Storage is a per-browser convenience: absent or blocked storage simply shows the callouts.
function readSeen(): Set<CalloutId> {
  try {
    const raw = localStorage.getItem(CALLOUT_STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as CalloutId[]) : []);
  } catch {
    return new Set();
  }
}

export function markSeen(id: CalloutId): void {
  try {
    const seen = readSeen();
    seen.add(id);
    localStorage.setItem(CALLOUT_STORAGE_KEY, JSON.stringify([...seen]));
  } catch {
    /* storage unavailable: the callout may show again next time */
  }
}

/** Which callouts the current screen would trigger, in spec order (first wins). */
export function triggeredCallouts(snap: Snapshot, me: PlayerId): CalloutId[] {
  const s = snap.view!.state;
  const out: CalloutId[] = [];
  if (s.phase.kind === 'turn' && s.phase.step.kind === 'buy_or_decline') out.push('for_sale');
  for (const e of snap.recentEvents) {
    if (e.type === 'PAYMENT_MADE' && e.reason === 'yield' && (e.from === me || e.to === me)) out.push('yield');
    if (e.type === 'DEBT_INCURRED' && e.player === me) out.push('debt');
    if (e.type === 'LEVERAGE_TOKEN_GRANTED' && e.player === me) out.push('leverage');
    if (e.type === 'CITY_PULSE_TELEGRAPHED') out.push('pulse');
    if ((e.type === 'EXCHANGE_DISCOUNT_GRANTED' || e.type === 'WINDFALL_RECEIVED') && e.player === me) out.push('special');
  }
  if (snap.legal.some((c) => c.type === 'REROLL_PULSE')) out.push('special');
  return out;
}

/** The first triggered callout not yet seen in this browser, or null. */
export function pendingCallout(snap: Snapshot, me: PlayerId): CalloutId | null {
  const seen = readSeen();
  for (const id of triggeredCallouts(snap, me)) if (!seen.has(id)) return id;
  return null;
}

/** Anchored note with a non-primary "Got it" that only records the dismissal. */
export function renderCallout(id: CalloutId): HTMLElement {
  const c = CALLOUTS[id];
  const el = h('aside', { class: 'callout', role: 'note', 'data-callout': id },
    h('div', { class: 'callout-head' },
      h('span', { class: 'callout-title' }, '💡 ', c.title),
      h('button', { class: 'link callout-dismiss', click: () => { markSeen(id); el.remove(); } }, 'Got it'),
    ),
    h('p', {}, c.text),
  );
  return el;
}
