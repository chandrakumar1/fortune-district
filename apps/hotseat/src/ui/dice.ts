/**
 * Dice. The engine generated both dice at TURN_STARTED (DICE_ROLLED); nothing
 * here rolls anything. The existing short reveal animation plays once per roll,
 * then the only action is to move by the total. Faces cycle in a fixed pattern.
 */

import type { Command, GameEvent, PlayerId } from '../engine.ts';
import type { Host, Snapshot } from '../host.ts';
import { h } from './dom.ts';

export const DIE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
export const ROLL_MS = 800;
export const ROLL_FRAME_MS = 70;
/** DICE_ROLLED seqs whose reveal animation has finished (so re-renders don't replay it). */
export const revealedRolls = new Set<number>();

export function currentRollSeq(snap: Snapshot, me: PlayerId): number {
  const rolled = [...snap.view!.state.eventLog].reverse().find((e): e is Extract<GameEvent, { type: 'DICE_ROLLED' }> => e.type === 'DICE_ROLLED' && e.player === me);
  return rolled?.seq ?? -1;
}

export function renderDiceRoll(snap: Snapshot, me: PlayerId, dice: readonly [number, number], legal: readonly Command[], host: Host): HTMLElement {
  const seq = currentRollSeq(snap, me);
  const sum = dice[0] + dice[1];
  const animate = seq >= 0 && !revealedRolls.has(seq);
  const sentence = `You rolled ${dice[0]} + ${dice[1]} = ${sum}. Move ${sum} spaces forward.`;

  // Hierarchy: dice result → what it means → the one primary action.
  const faces = dice.map((v) => h('div', { class: `die${animate ? ' rolling' : ''}` }, DIE_FACES[v - 1] ?? String(v)));
  const total = h('div', { class: 'sum' }, animate ? '' : `= ${sum}`);
  const title = h('h2', {}, animate ? 'Your dice…' : sentence);
  const buttons = legal
    .filter((c): c is Extract<Command, { type: 'ADVANCE' }> => c.type === 'ADVANCE')
    .map((c) => h('button', { class: 'primary big', disabled: animate, click: () => host.dispatch(c) }, `Move ${sum}`));
  const wrap = h('div', {}, h('div', { class: 'dice' }, ...faces, total), title, h('div', { class: 'row' }, ...buttons));

  if (animate) {
    let frame = 0;
    const start = Date.now();
    const tick = setInterval(() => {
      frame++;
      faces.forEach((el, i) => { el.textContent = DIE_FACES[(frame * (i + 1) + i * 2) % 6] ?? ''; });
      if (Date.now() - start >= ROLL_MS) {
        clearInterval(tick);
        revealedRolls.add(seq);
        faces.forEach((el, i) => { el.textContent = DIE_FACES[dice[i]! - 1] ?? String(dice[i]); el.classList.remove('rolling'); });
        total.textContent = `= ${sum}`;
        title.textContent = sentence;
        buttons.forEach((b) => b.removeAttribute('disabled'));
      }
    }, ROLL_FRAME_MS);
  }
  return wrap;
}
