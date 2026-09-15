/**
 * DOM renderer for the hot-seat prototype — dispatcher only. Screens and
 * components live in ./ui/*. Presentation only: every button corresponds to a
 * command the engine already listed as legal, every number comes from the
 * engine's state or helpers, and the auction screen renders the keyboard
 * holder's redacted view. Internal step names never reach the screen.
 */

import { Host } from './host.ts';
import type { Snapshot } from './host.ts';
import { renderHandoff } from './ui/handoff.ts';
import { renderPlaying } from './ui/playing.ts';
import { renderEnded } from './ui/results.ts';
import { renderSetup } from './ui/setup.ts';
import { timerFraction, timerState, timerText } from './ui/status-bar.ts';
import { mountTooltips } from './ui/tooltip.ts';

export function render(root: HTMLElement, snap: Snapshot, host: Host, reason: 'change' | 'tick'): void {
  if (reason === 'tick') {
    // Timer ticks update text, ring fill and warn/loss state in place — no re-render.
    const state = timerState(snap);
    for (const el of root.querySelectorAll('.timer-value')) el.textContent = timerText(snap);
    for (const el of root.querySelectorAll('.timer')) el.setAttribute('class', `timer ${state}`);
    for (const el of root.querySelectorAll('.timer-ring')) {
      el.setAttribute('class', `timer-ring ${state}`);
      (el as HTMLElement).style.setProperty('--frac', timerFraction(snap).toFixed(3));
    }
    return;
  }
  mountTooltips(root); // once per root (Phase 4, spec §3 Tooltip)
  root.replaceChildren();
  switch (snap.phase) {
    case 'setup':
      root.append(renderSetup(host));
      return;
    case 'ended':
      root.append(renderEnded(snap, host));
      return;
    case 'playing':
      if (snap.handoffTo) root.append(renderHandoff(snap, host));
      else root.append(renderPlaying(snap, host));
      return;
  }
}
