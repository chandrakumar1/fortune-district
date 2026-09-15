/** Pass-the-keyboard screen. */

import type { Host, Snapshot } from '../host.ts';
import { h } from './dom.ts';
import { renderRecap } from './recap.ts';
import { nameOf, token } from './theme.ts';

export function renderHandoff(snap: Snapshot, host: Host): HTMLElement {
  const view = snap.view!;
  const to = snap.handoffTo!;
  const inAuction = view.state.phase.kind === 'auction';
  const recap = renderRecap(snap, to, true);
  return h(
    'section',
    { class: 'card handoff' },
    h('p', { class: 'muted' }, `Round ${view.state.round} of 12 · ${inAuction ? 'sealed auction' : 'next turn'}`),
    h('h1', {}, 'Pass the keyboard to ', token(view, to, { size: 'lg' }), ` ${nameOf(view, to)}`),
    h('p', {}, inAuction ? 'Everyone else: look away — bids are secret.' : 'Your timer starts when you press the button.'),
    recap,
    h('button', { class: 'primary big', click: () => host.ready() }, "I'm ready"),
  );
}
