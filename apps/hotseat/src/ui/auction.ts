/** Sealed bid screen (existing mechanic and flow; wording and emphasis only). */

import { tileName } from '../engine.ts';
import type { GameEvent } from '../engine.ts';
import type { Host, Snapshot } from '../host.ts';
import { h, money } from './dom.ts';
import { nameOf } from './theme.ts';

export function renderBidScreen(snap: Snapshot, host: Host, box: HTMLElement): HTMLElement {
  const view = snap.view!;
  const a = view.state.auction!;
  const me = snap.keyboard!;
  const tile = view.state.board[a.tileIndex]!;
  const my = view.state.players.find((p) => p.id === me)!;
  // Who has already decided: sealed bids are public as BID_RECEIVED (bidder only, no amount) since this auction opened; passes are host-tracked.
  const log = view.state.eventLog;
  const openedAt = log.map((e) => e.type).lastIndexOf('AUCTION_OPENED');
  const sealed = new Set(log.slice(openedAt).filter((e): e is Extract<GameEvent, { type: 'BID_RECEIVED' }> => e.type === 'BID_RECEIVED').map((e) => e.bidder));
  const stillToAct = a.eligible.filter((id) => id !== me && !snap.passed.includes(id) && !sealed.has(id)).length;
  const input = h('input', { type: 'number', min: String(a.minimumBid), step: '1', value: String(a.minimumBid), class: 'bid' }) as HTMLInputElement;
  const submit = () => host.dispatch({ type: 'SUBMIT_SEALED_BID', by: me, amount: Number(input.value) });
  input.addEventListener('keydown', (ev) => { if ((ev as KeyboardEvent).key === 'Enter') submit(); });
  box.append(
    h('h2', {}, `Place your bid — ${tileName(tile)}`),
    h('p', {}, tile.kind === 'property' ? `${tile.category}, tier ${tile.tier}. List price ${money(tile.price)}; base yield ${money(tile.baseYield)}.` : ''),
    h('p', {}, `${a.origin === 'decline' ? `${nameOf(view, a.openedBy)} sent it to auction.` : `${nameOf(view, a.openedBy)} forced this auction with Leverage.`} Bids are secret. Minimum ${money(a.minimumBid)}, maximum your cash (${money(my.cash)}). Highest bid wins.`),
    h('div', { class: 'row' }, input, h('button', { class: 'primary big', click: submit }, 'Seal my bid'), h('button', { class: 'secondary', click: () => host.pass() }, 'No bid')),
    h('p', { class: 'muted small' }, stillToAct > 0 ? `${stillToAct} more ${stillToAct === 1 ? 'player' : 'players'} will bid after you; the result is revealed when everyone has decided.` : 'You are the last bidder; the result is revealed when you decide.'),
  );
  setTimeout(() => input.focus(), 0);
  return box;
}
