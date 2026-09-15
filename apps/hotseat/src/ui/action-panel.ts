/**
 * Action panel — the decision surface (spec §3 Action Panel, §4 screens B–N).
 * Fixed internal order: token+ring → What just happened → headline → context →
 * ONE primary → secondary / optional rows. Every button comes from `legal`;
 * every number from state, events or exported engine helpers.
 */

import { tileName, upgradeCost, yieldFor } from '../engine.ts';
import type { Command, GameState, PlayerView } from '../engine.ts';
import type { Host, Snapshot } from '../host.ts';
import { h, money } from './dom.ts';
import { TERMS, plainError } from './copy.ts';
import { tileLabel } from './board.ts';
import { renderBidScreen } from './auction.ts';
import { renderDiceRoll } from './dice.ts';
import { renderRecap } from './recap.ts';
import { activeToken } from './status-bar.ts';
import { tierPips, upgradePips } from './parcel.ts';
import { pendingCallout, renderCallout } from './callouts.ts';
import { term, tipped } from './tooltip.ts';

/** Phase 4: the first unseen first-time callout for this screen, anchored in the panel (spec §11). */
function calloutFor(snap: Snapshot, me: PlayerView['viewer']): HTMLElement | null {
  const id = pendingCallout(snap, me);
  return id ? renderCallout(id) : null;
}

/** Display-only: what a parcel would pay after one more upgrade, using the engine's own yield helper on a patched copy. */
function yieldAfterUpgrade(state: PlayerView['state'], tileIndex: number): number {
  const patched = { ...state, upgrades: { ...state.upgrades, [tileIndex]: (state.upgrades[tileIndex] ?? 0) + 1 } } as unknown as GameState;
  return yieldFor(patched, tileIndex);
}

export function renderActionPanel(snap: Snapshot, host: Host): HTMLElement {
  const view = snap.view!;
  const s = view.state;
  const me = snap.keyboard!;
  const box = h('section', { class: 'card action-panel' });
  box.append(h('div', { class: 'action-token' }, activeToken(snap, 'md')));
  if (snap.lastError) box.append(h('div', { class: 'error' }, '⚠ ', plainError(snap.lastError.code, snap.lastError.message)));

  if (s.phase.kind === 'auction' && s.auction) return renderBidScreen(snap, host, box);
  if (s.phase.kind !== 'turn') return box;

  const step = s.phase.step;
  const legal = snap.legal;
  const primary = (label: string, cmd: Command) => h('button', { class: 'primary big', click: () => host.dispatch(cmd) }, label);
  const secondary = (label: string, cmd: Command, danger = false) => h('button', { class: `secondary${danger ? ' danger' : ''}`, click: () => host.dispatch(cmd) }, label);
  const timedOut = snap.recentEvents.some((e) => e.type === 'TURN_TIMED_OUT' && e.player === me);

  switch (step.kind) {
    case 'roll': {
      box.append(renderDiceRoll(snap, me, step.dice, legal, host));
      const callout = calloutFor(snap, me);
      if (callout) box.append(callout);
      break;
    }

    case 'buy_or_decline': {
      const recap = renderRecap(snap, me, false);
      if (recap) box.append(recap);
      const tile = s.board[step.tileIndex];
      const price = tile && tile.kind === 'property' ? tile.price : 0;
      const my = s.players.find((p) => p.id === me)!;
      const canBuy = legal.some((c) => c.type === 'BUY_PROPERTY');
      box.append(h('h2', {}, `You landed on ${tile ? tileName(tile) : 'a property'} — nobody owns it`));
      if (tile && tile.kind === 'property') {
        box.append(h('div', { class: 'tile-line' }, h('span', { class: 'tile-code' }, `${tile.category.slice(0, 3).toUpperCase()} ${tierPips(tile.tier)}`), ` ${tile.category}, tier ${tile.tier} · price ${money(tile.price)} · pays you ${money(tile.baseYield)} when an opponent lands here · you have ${money(my.cash)}`));
      }
      box.append(h('p', { class: 'context' }, ...(canBuy ? ['Buy it, or send it to a ', term('auction', 'sealed auction'), ' where everyone (including you) can bid.'] : [`You can't afford the ${money(price)} price, so it goes to `, term('auction'), ' — you can still bid there.'])));
      const row = h('div', { class: 'row actions-row' });
      for (const c of legal) {
        if (c.type === 'BUY_PROPERTY') row.append(primary(`Buy for ${money(price)}`, c));
        if (c.type === 'DECLINE_PROPERTY') row.append(canBuy ? secondary('Send to auction', c, true) : primary('Send to auction', c));
      }
      box.append(row);
      // Callout sits under the primary so the decision never drops below the centre-slot fold.
      const callout = calloutFor(snap, me);
      if (callout) box.append(callout);
      break;
    }

    case 'actions': {
      const recap = renderRecap(snap, me, false);
      if (recap) box.append(recap);
      const upgrades = legal.filter((c): c is Extract<Command, { type: 'UPGRADE_PROPERTY' }> => c.type === 'UPGRADE_PROPERTY');
      const forces = legal.filter((c): c is Extract<Command, { type: 'USE_LEVERAGE_TOKEN' }> => c.type === 'USE_LEVERAGE_TOKEN' && c.payload.kind === 'force_auction');
      const credit = legal.find((c) => c.type === 'USE_LEVERAGE_TOKEN' && c.payload.kind === 'credit_line');
      const reroll = legal.find((c) => c.type === 'REROLL_PULSE');
      const endTurn = legal.find((c) => c.type === 'END_TURN');
      const my = s.players.find((p) => p.id === me)!;
      const justBought = snap.recentEvents.find((e) => e.type === 'PROPERTY_PURCHASED' && e.player === me);
      const justUpgraded = snap.recentEvents.find((e) => e.type === 'PROPERTY_UPGRADED' && e.player === me);

      // Headline (spec §4 D/H/I/J/N wording).
      let headline = 'Your move is done';
      let context: (string | HTMLElement)[] = [];
      if (timedOut) {
        headline = 'Time ran out';
        context = ['The game acted for you (see above). You can still take optional actions, then end your turn.'];
      } else if (reroll) {
        headline = 'Reroll the next City Pulse, or keep it';
        context = ['Pulse Relay: you may replace the next announced ', term('Pulse'), ' with a new random one.'];
      } else if (justBought && justBought.type === 'PROPERTY_PURCHASED') {
        // Spec §4 D: the purchase itself is confirmed in the recap; the headline says what comes next.
        headline = 'Your move is done';
        context = ['Your ', term('net worth'), ' is unchanged — the price now counts as property. It pays you whenever an opponent lands there.'];
      } else if (justUpgraded && justUpgraded.type === 'PROPERTY_UPGRADED') {
        headline = 'Your move is done';
        context = ['Upgrades count toward your ', term('net worth'), ' and raise what the property pays you.'];
      } else if (step.exchangeDiscount && upgrades.length) {
        headline = 'Choose your upgrade — 20% off this turn';
        context = ['Exchange: one upgrade at 80% of its cost. It still counts as this turn\'s one upgrade.'];
      }
      box.append(h('h2', {}, headline));
      const hasOptions = upgrades.length > 0 || forces.length > 0 || credit !== undefined;
      if (!context.length) context = [hasOptions ? 'Optional actions below, then end your turn.' : 'Nothing else to do — end your turn.'];
      box.append(h('p', { class: 'context' }, ...context));

      const row = h('div', { class: 'row actions-row' });
      if (reroll) row.append(primary('Reroll the next Pulse', reroll));
      if (endTurn) row.append(reroll ? secondary('Keep it and end turn', endTurn) : primary('End turn', endTurn));
      box.append(row);
      const callout = calloutFor(snap, me);
      if (callout) box.append(callout);

      // Phase 4 (spec §2.5 / §11): owned parcels with no legal upgrade appear disabled, with the engine's reason.
      const legalUpgradeTiles = new Set(upgrades.map((c) => c.tileIndex));
      const blocked = Object.entries(s.ownership)
        .filter(([i, owner]) => owner === me && !legalUpgradeTiles.has(Number(i)))
        .map(([i]) => Number(i))
        .sort((a, b) => a - b);
      const showLeverage = my.leverageTokens > 0 || forces.length > 0 || credit !== undefined;

      if (hasOptions || blocked.length || showLeverage) {
        const opts = h('div', { class: 'options' }, h('div', { class: 'options-title' }, 'Optional this turn'));

        // H — upgrade rows: one row per legal upgrade, cost and yield before → after; blocked parcels disabled with reason.
        if (upgrades.length || blocked.length) {
          const list = h('div', { class: 'upgrade-rows' }, tipped(h('div', { class: 'opt-heading' }, `Upgrade a property${step.exchangeDiscount ? ' · 20% off' : ''}`), TERMS.upgrade));
          for (const c of upgrades) {
            const t = s.board[c.tileIndex]!;
            if (t.kind !== 'property') continue;
            const lvl = s.upgrades[c.tileIndex] ?? 0;
            const cost = upgradeCost(s, c.tileIndex, step.exchangeDiscount);
            list.append(
              h('div', { class: 'upgrade-row' },
                h('span', { class: 'ur-name' }, tileName(t), ' ', h('span', { class: 'tile-code' }, `${t.category.slice(0, 3).toUpperCase()} ${upgradePips(lvl)}`)),
                h('span', { class: 'ur-detail' }, `level ${lvl} → ${lvl + 1} · ${money(cost)} · pays ${money(yieldFor(s, c.tileIndex))} → ${money(yieldAfterUpgrade(s, c.tileIndex))}`),
                secondary(`Upgrade · ${money(cost)}`, c),
              ),
            );
          }
          for (const i of blocked) {
            const t = s.board[i]!;
            if (t.kind !== 'property') continue;
            const lvl = s.upgrades[i] ?? 0;
            const why = host.explain({ type: 'UPGRADE_PROPERTY', by: me, tileIndex: i });
            const reason = why ? plainError(why.code, why.message) : 'Not available right now.';
            list.append(
              h('div', { class: 'upgrade-row disabled-row' },
                h('span', { class: 'ur-name' }, tileName(t), ' ', h('span', { class: 'tile-code' }, `${t.category.slice(0, 3).toUpperCase()} ${upgradePips(lvl)}`)),
                h('span', { class: 'ur-detail reason' }, reason),
                h('button', { class: 'secondary', disabled: true, 'data-tip': reason, 'aria-disabled': 'true' }, 'Upgrade'),
              ),
            );
          }
          opts.append(list);
        }

        // I — Leverage: two option cards; only legal options have a live button, the others are disabled with the engine's reason.
        if (showLeverage) {
          const lev = h('div', { class: 'leverage' }, h('div', { class: 'opt-heading' }, `${'◈'.repeat(my.leverageTokens)} `, term('Leverage'), ` — you have ${my.leverageTokens} token${my.leverageTokens === 1 ? '' : 's'} · each option costs 1`));
          const cards = h('div', { class: 'lev-cards' });
          if (!forces.length) {
            // Probe the first property tile: the engine names the real blocker (e.g. no unowned property).
            const probeTile = s.board.findIndex((t) => t.kind === 'property');
            const why = host.explain({ type: 'USE_LEVERAGE_TOKEN', by: me, payload: { kind: 'force_auction', tileIndex: probeTile } });
            const reason = why ? plainError(why.code, why.message) : 'Not available right now.';
            cards.append(
              h('div', { class: 'lev-card disabled-row' },
                h('div', { class: 'lev-title' }, '⚖ Force auction'),
                h('p', { class: 'small' }, 'Put an unowned property up for sealed bids. You may bid too.'),
                h('p', { class: 'small reason' }, reason),
                h('button', { class: 'secondary', disabled: true, 'data-tip': reason, 'aria-disabled': 'true' }, 'Force auction'),
              ),
            );
          }
          if (forces.length) {
            const sel = h('select', {}) as HTMLSelectElement;
            for (const c of forces) {
              if (c.payload.kind !== 'force_auction') continue;
              sel.append(h('option', { value: String(c.payload.tileIndex) }, tileLabel(s.board[c.payload.tileIndex]!)));
            }
            cards.append(
              h('div', { class: 'lev-card' },
                h('div', { class: 'lev-title' }, '⚖ Force auction'),
                h('p', { class: 'small' }, 'Put an unowned property up for sealed bids. You may bid too.'),
                sel,
                h('button', { class: 'secondary', click: () => host.dispatch({ type: 'USE_LEVERAGE_TOKEN', by: me, payload: { kind: 'force_auction', tileIndex: Number(sel.value) } }) }, 'Force auction'),
              ),
            );
          }
          if (credit) {
            cards.append(
              h('div', { class: 'lev-card' },
                h('div', { class: 'lev-title' }, '₵ Credit line'),
                h('p', { class: 'small' }, 'Take ₵200 now, interest-free. It counts against your ', term('net worth'), ' at the end.'),
                secondary('Take ₵200', credit),
              ),
            );
          } else {
            const why = host.explain({ type: 'USE_LEVERAGE_TOKEN', by: me, payload: { kind: 'credit_line' } });
            const reason = why ? plainError(why.code, why.message) : 'Not available right now.';
            cards.append(
              h('div', { class: 'lev-card disabled-row' },
                h('div', { class: 'lev-title' }, '₵ Credit line'),
                h('p', { class: 'small' }, 'Take ₵200 now, interest-free. It counts against your ', term('net worth'), ' at the end.'),
                h('p', { class: 'small reason' }, reason),
                h('button', { class: 'secondary', disabled: true, 'data-tip': reason, 'aria-disabled': 'true' }, 'Take ₵200'),
              ),
            );
          }
          lev.append(cards);
          opts.append(lev);
        }
        box.append(opts);
      }
      break;
    }
  }
  return box;
}
