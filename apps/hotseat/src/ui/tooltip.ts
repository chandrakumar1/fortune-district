/**
 * Tooltip (spec §3 Tooltip, §11): dotted-underlined terms show a 240 px card
 * in dusk-700 with ivory text after a 300 ms delay, on hover or keyboard focus.
 * One shared tooltip element, delegated listeners mounted once on the root.
 * Presentation only.
 */

import { h } from './dom.ts';
import { TERMS } from './copy.ts';
import type { TermKey } from './copy.ts';

export const TOOLTIP_DELAY_MS = 300;

/** A dotted-underlined term with its explanation. `label` defaults to the term itself. */
export function term(key: TermKey, label?: string): HTMLElement {
  return h('span', { class: 'term', tabindex: '0', 'data-tip': TERMS[key] }, label ?? key);
}

/** Any element with a custom explanation (e.g. a disabled control's reason). */
export function tipped(el: HTMLElement, tip: string): HTMLElement {
  el.setAttribute('data-tip', tip);
  if (el.tagName !== 'BUTTON' && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
  return el;
}

const mounted = new WeakSet<HTMLElement>();

export function mountTooltips(root: HTMLElement): void {
  if (mounted.has(root)) return;
  mounted.add(root);

  let tip: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let current: Element | null = null;

  const hide = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (current) current.removeAttribute('aria-describedby');
    current = null;
    if (tip) tip.hidden = true;
  };

  const show = (el: Element) => {
    const text = el.getAttribute('data-tip');
    if (!text) return;
    if (!tip) {
      tip = h('div', { class: 'tooltip', role: 'tooltip', id: 'fd-tooltip' });
      tip.hidden = true;
      document.body.append(tip);
    }
    tip.textContent = text;
    tip.hidden = false;
    el.setAttribute('aria-describedby', 'fd-tooltip');
    // Position below the term, clamped to the viewport; above if there is no room.
    const r = el.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const left = Math.min(Math.max(8, r.left), vw - tw - 8);
    let top = r.bottom + 6;
    if (top + th > vh - 8) top = Math.max(8, r.top - th - 6);
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  };

  const arm = (ev: Event) => {
    const el = (ev.target as Element | null)?.closest?.('[data-tip]') ?? null;
    if (!el || el === current) return;
    hide();
    current = el;
    timer = setTimeout(() => {
      timer = null;
      if (current === el) show(el);
    }, TOOLTIP_DELAY_MS);
  };
  const disarm = (ev: Event) => {
    const el = (ev.target as Element | null)?.closest?.('[data-tip]') ?? null;
    if (el && el === current) hide();
  };

  root.addEventListener('mouseover', arm);
  root.addEventListener('mouseout', disarm);
  root.addEventListener('focusin', arm);
  root.addEventListener('focusout', disarm);
  root.addEventListener('keydown', (ev) => {
    if ((ev as KeyboardEvent).key === 'Escape') hide();
  });
}
