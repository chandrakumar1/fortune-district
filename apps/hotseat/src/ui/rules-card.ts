/**
 * Persistent "?" and the rules card it opens (spec §11): the rules summary and
 * the Net Worth formula, built from copy.ts sentences and engine constants.
 * Opens as an overlay; closes with ✕, Esc or the backdrop. Dispatches nothing.
 */

import type { HostConfig } from '../host.ts';
import { h } from './dom.ts';
import { rulesSections } from './copy.ts';

export function renderRulesCard(config: HostConfig, onClose: () => void): { readonly overlay: HTMLElement; readonly closeButton: HTMLElement } {
  const closeButton = h('button', { class: 'rules-close', 'aria-label': 'Close', click: onClose }, '✕');
  const card = h(
    'div',
    { class: 'rules-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'rules-title' },
    h('div', { class: 'rules-head' }, h('h2', { id: 'rules-title' }, 'How Fortune District works'), closeButton),
    ...rulesSections(config).map((sec) =>
      h('section', { class: 'rules-section' },
        h('h3', {}, sec.title),
        h('ul', {}, ...sec.lines.map((line) => h('li', {}, line))),
      ),
    ),
  );
  const overlay = h('div', { class: 'rules-overlay' }, card);
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) onClose();
  });
  overlay.addEventListener('keydown', (ev) => {
    if ((ev as KeyboardEvent).key === 'Escape') onClose();
  });
  return { overlay, closeButton };
}

/** The persistent "?" button: opens the rules card over the current screen (appended to `container`, default document.body). */
export function renderRulesButton(config: HostConfig, container?: HTMLElement): HTMLElement {
  const btn = h('button', { class: 'rules-btn', 'aria-label': 'Rules and net worth formula', 'data-tip': 'Rules card and the net worth formula' }, '?');
  let open: HTMLElement | null = null;
  btn.addEventListener('click', () => {
    if (open) return;
    const { overlay, closeButton } = renderRulesCard(config, () => {
      overlay.remove();
      open = null;
      btn.focus();
    });
    open = overlay;
    (container ?? document.body).append(overlay);
    closeButton.focus();
  });
  return btn;
}
