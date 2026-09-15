/** Event log and export. */

import type { GameEvent, PlayerView } from '../engine.ts';
import type { Host } from '../host.ts';
import { h } from './dom.ts';
import { describe } from './copy.ts';

export function renderLog(events: readonly GameEvent[], view: PlayerView): HTMLElement {
  const items = (list: readonly GameEvent[]) => list.slice().reverse().map((e) => h('li', { class: e.type === 'ROUND_ENDED' ? 'round' : '' }, describe(e, view)));
  return h('section', { class: 'card log' },
    h('h2', {}, 'Log'),
    h('ul', {}, ...items(events.slice(-8))),
    events.length > 8 ? h('details', {}, h('summary', { class: 'muted' }, `Show full log (${events.length})`), h('ul', {}, ...items(events))) : null,
  );
}

export async function copyLog(host: Host): Promise<void> {
  const text = host.exportLog();
  try {
    await navigator.clipboard.writeText(text);
    alert('Event log copied to clipboard.');
  } catch {
    const w = window.open('', '_blank');
    if (w) { w.document.write(`<pre>${text.replace(/</g, '&lt;')}</pre>`); w.document.close(); }
  }
}
