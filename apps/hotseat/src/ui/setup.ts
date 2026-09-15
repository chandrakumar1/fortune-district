/** Match setup screen. */

import { AUCTION_BID_WINDOW_SECONDS, MAX_PLAYERS, MIN_PLAYERS, PLAYTEST_TURN_TIMER_SECONDS, TURN_TIMER_SECONDS } from '../engine.ts';
import { Host } from '../host.ts';
import type { HostConfig } from '../host.ts';
import { h } from './dom.ts';

export function renderSetup(host: Host): HTMLElement {
  const nameInputs: HTMLInputElement[] = [];
  const countSelect = h('select', { id: 'count' }) as HTMLSelectElement;
  for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) countSelect.append(h('option', { value: String(n) }, `${n} players`));
  countSelect.value = '3';

  const namesBox = h('div', { class: 'names' });
  const refreshNames = () => {
    namesBox.replaceChildren();
    nameInputs.length = 0;
    for (let i = 0; i < Number(countSelect.value); i++) {
      const input = h('input', { type: 'text', value: `Player ${i + 1}`, maxlength: '16' }) as HTMLInputElement;
      nameInputs.push(input);
      namesBox.append(h('label', {}, `Player ${i + 1} name `, input));
    }
  };
  countSelect.addEventListener('change', refreshNames);
  refreshNames();

  const seedInput = h('input', { type: 'number', placeholder: 'random', id: 'seed' }) as HTMLInputElement;
  const timerSelect = h('select', { id: 'timer' }) as HTMLSelectElement;
  timerSelect.append(
    h('option', { value: String(PLAYTEST_TURN_TIMER_SECONDS) }, `${PLAYTEST_TURN_TIMER_SECONDS} seconds per decision (playtest)`),
    h('option', { value: String(TURN_TIMER_SECONDS) }, `${TURN_TIMER_SECONDS} seconds per decision (official)`),
    h('option', { value: 'off' }, 'no timer'),
  );

  const start = () => {
    // Blank seed → derive one from the clock (host concern; no Math.random anywhere). It is shown and saved for replay.
    const seed = seedInput.value.trim() === '' ? Date.now() % 2 ** 31 : Number(seedInput.value);
    const players = nameInputs.map((inp, i) => ({ id: `p${i + 1}`, displayName: inp.value.trim() || `Player ${i + 1}` }));
    const config: HostConfig =
      timerSelect.value === 'off'
        ? { decisionSeconds: null, auctionSeconds: null }
        : { decisionSeconds: Number(timerSelect.value), auctionSeconds: AUCTION_BID_WINDOW_SECONDS };
    host.setConfig(config);
    host.newMatch(players, seed);
  };

  return h(
    'section',
    { class: 'card setup' },
    h('h1', {}, 'Fortune District — hot-seat playtest'),
    h('p', { class: 'muted' }, 'One computer, pass the keyboard between turns. The game decides what is allowed; this screen only shows your options.'),
    h('label', {}, 'Players ', countSelect),
    namesBox,
    h('label', {}, 'Timer ', timerSelect),
    h('details', {}, h('summary', { class: 'muted' }, 'Advanced'), h('label', {}, 'Seed (optional, for replay) ', seedInput)),
    h('div', { class: 'row' },
      h('button', { class: 'primary big', click: start }, 'Start match'),
      Host.hasSavedMatch() ? h('button', { click: () => host.restore() }, 'Resume saved match') : null,
    ),
  );
}
