/**
 * Player cards (spec §3 Player Card / §10). The keyboard holder's card is
 * expanded and doubles as the Money HUD (floating ±₵ deltas from the most
 * recent events); other players are compact. Debt / credit / Leverage appear
 * as chips only when non-zero. "Last place" = lowest Net Worth as the engine
 * reports it (display only; ties all flagged).
 */

import type { Snapshot } from '../host.ts';
import { h, money } from './dom.ts';
import { moneyDelta } from './deltas.ts';
import { identityOf, token } from './theme.ts';
import { TERMS } from './copy.ts';
import { tipped } from './tooltip.ts';

const NET_WORTH_HELP = TERMS['net worth'];

export function renderPlayers(snap: Snapshot): HTMLElement {
  const view = snap.view!;
  const players = view.state.players;
  const worths = players.map((p) => snap.netWorth[p.id] ?? 0);
  const lowest = Math.min(...worths);

  const cards = players.map((p) => {
    const isMe = p.id === snap.keyboard;
    const nw = snap.netWorth[p.id] ?? 0;
    const last = players.length > 1 && nw === lowest;
    const d = isMe ? moneyDelta(snap.recentEvents, p.id) : null;

    const chips: (HTMLElement | null)[] = [
      p.debt ? tipped(h('span', { class: 'chip loss' }, `Debt ${money(p.debt)} ↑10%/round`), TERMS.debt) : null,
      p.creditLine ? tipped(h('span', { class: 'chip info' }, `Credit ${money(p.creditLine)}`), TERMS['credit line']) : null,
      p.leverageTokens ? tipped(h('span', { class: 'chip lev' }, `${'◈'.repeat(p.leverageTokens)} Leverage`), TERMS.Leverage) : null,
      last ? tipped(h('span', { class: 'chip flag' }, '⚑ last'), TERMS['last place']) : null,
    ];

    const cashDelta = d && d.cash !== 0 ? h('span', { class: `float ${d.cash > 0 ? 'gain' : 'loss'}` }, `${d.cash > 0 ? '+' : '−'}${money(Math.abs(d.cash))}`) : null;

    return h(
      'div',
      { class: `player-card${isMe ? ' me' : ''}`, style: `--pc:${identityOf(view, p.id).colour}` },
      h('div', { class: 'pc-row1' }, token(view, p.id, { size: isMe ? 'md' : 'sm' }), h('span', { class: 'pc-name' }, p.displayName), isMe ? h('span', { class: 'you-tag' }, 'YOU') : null),
      h('div', { class: 'pc-row2' },
        h('span', { class: 'stat' }, tipped(h('span', { class: 'stat-label' }, 'Cash'), 'Money you can spend now'), h('span', { class: 'stat-value' }, money(p.cash), cashDelta)),
        h('span', { class: 'stat' }, tipped(h('span', { class: 'stat-label' }, 'Net worth'), NET_WORTH_HELP), h('span', { class: 'stat-value' }, money(nw))),
      ),
      chips.some(Boolean) ? h('div', { class: 'pc-row3' }, ...chips) : null,
    );
  });

  return h('section', { class: 'card players' }, h('h2', {}, 'Players'), ...cards, h('p', { class: 'muted small' }, NET_WORTH_HELP));
}
