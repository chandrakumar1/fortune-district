/**
 * Tiny DOM helpers shared by all UI modules. No game logic here.
 */

import { CURRENCY_SYMBOL as C } from '../engine.ts';

export type Child = Node | string | null | undefined | false;

export function h(tag: string, attrs: Record<string, string | boolean | ((ev: Event) => void)> = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') el.addEventListener(k, v);
    else if (typeof v === 'boolean') {
      if (v) el.setAttribute(k, '');
    } else el.setAttribute(k, v);
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export const money = (n: number) => `${C}${n.toLocaleString('en-US')}`;

/**
 * Keyed reconciliation: reuse existing child elements by key so a re-render
 * can preserve element identity (needed for CSS transitions in later phases).
 * Phase 0 does not use it yet; every screen still rebuilds fully.
 */
export function reconcile<T>(parent: HTMLElement, items: readonly T[], key: (item: T) => string, render: (item: T, existing: HTMLElement | null) => HTMLElement): void {
  const existing = new Map<string, HTMLElement>();
  for (const child of Array.from(parent.children)) {
    const k = (child as HTMLElement).dataset['key'];
    if (k !== undefined) existing.set(k, child as HTMLElement);
  }
  const next: HTMLElement[] = [];
  for (const item of items) {
    const k = key(item);
    const el = render(item, existing.get(k) ?? null);
    el.dataset['key'] = k;
    existing.delete(k);
    next.push(el);
  }
  for (const stale of existing.values()) stale.remove();
  parent.replaceChildren(...next);
}
