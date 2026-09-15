/** The in-match screen: status bar, main column (action panel + board), side column. */

import type { Host, Snapshot } from '../host.ts';
import { h } from './dom.ts';
import { renderActionPanel } from './action-panel.ts';
import { renderBoard } from './board.ts';
import { copyLog, renderLog } from './log.ts';
import { renderPlayers } from './players.ts';
import { renderPulse } from './pulse.ts';
import { renderStatusBar } from './status-bar.ts';

export function renderPlaying(snap: Snapshot, host: Host): HTMLElement {
  const view = snap.view!;
  const s = view.state;
  return h(
    'div',
    { class: 'layout' },
    renderStatusBar(snap),
    h('div', { class: 'columns' },
      // The action panel lives in the ring's centre slot; CSS keeps it inside the
      // ring at ≥ 1200 px and places it above the ring below that (Phase 1, §7a).
      h('div', { class: 'main' }, renderBoard(snap, renderActionPanel(snap, host))),
      h('div', { class: 'side' }, renderPlayers(snap), renderPulse(view), renderLog(s.eventLog, view)),
    ),
    h('footer', { class: 'muted' },
      `seed ${snap.seed} · ${snap.commandCount} commands · `,
      h('button', { class: 'link', click: () => copyLog(host) }, 'copy log'),
      ' · ',
      h('button', { class: 'link', click: () => { if (confirm('Abandon this match?')) host.abandon(); } }, 'abandon match'),
    ),
  );
}
