/**
 * Match-over screen (spec §3 End-game scoreboard, §4 P): podium row of tokens,
 * then a ranked table whose Net Worth bars are decomposed into
 * cash / property / upgrades / −debt / −credit. Every figure is read from
 * state (`cash`, `pricePaid`, `upgradeSpend`, `debt`, `creditLine`) or from
 * the engine's MATCH_ENDED ranking; nothing is recomputed by a rule.
 */

import { PROPERTY_CATEGORIES, categoryTiles } from '../engine.ts';
import type { GameEvent, PlayerId, PlayerView } from '../engine.ts';
import type { Host, Snapshot } from '../host.ts';
import { h, money } from './dom.ts';
import { copyLog, renderLog } from './log.ts';
import { nameOf, token } from './theme.ts';

/** The five Net Worth components as the engine defines them (cash + prices paid + upgrades paid − debt − credit line). */
export interface NetWorthParts {
  readonly cash: number;
  readonly property: number;
  readonly upgrades: number;
  readonly debt: number;
  readonly credit: number;
}

export function netWorthParts(s: PlayerView['state'], id: PlayerId): NetWorthParts {
  const p = s.players.find((x) => x.id === id)!;
  const owned = Object.entries(s.ownership).filter(([, o]) => o === id).map(([i]) => Number(i));
  return {
    cash: p.cash,
    property: owned.reduce((a, i) => a + (s.pricePaid[i] ?? 0), 0),
    upgrades: owned.reduce((a, i) => a + (s.upgradeSpend[i] ?? 0), 0),
    debt: p.debt,
    credit: p.creditLine,
  };
}

const PART_LABEL: Record<keyof NetWorthParts, string> = { cash: 'cash', property: 'property', upgrades: 'upgrades', debt: '−debt', credit: '−credit' };

/** Stacked bar: positive segments then negative ones, all scaled to the largest gross total on the screen. */
function netWorthBar(parts: NetWorthParts, scale: number): HTMLElement {
  const bar = h('div', { class: 'nw-bar', role: 'img', 'aria-label': (Object.keys(PART_LABEL) as (keyof NetWorthParts)[]).map((k) => `${PART_LABEL[k]} ${money(parts[k])}`).join(', ') });
  for (const k of Object.keys(PART_LABEL) as (keyof NetWorthParts)[]) {
    const v = parts[k];
    if (v <= 0) continue;
    bar.append(h('span', { class: `seg ${k}`, style: `width:${((v / scale) * 100).toFixed(2)}%`, title: `${PART_LABEL[k]} ${money(v)}`, 'data-part': k, 'data-amount': String(v) }));
  }
  return bar;
}

export function renderEnded(snap: Snapshot, host: Host): HTMLElement {
  const view = snap.view!;
  const s = view.state;
  const end = s.eventLog.find((e): e is Extract<GameEvent, { type: 'MATCH_ENDED' }> => e.type === 'MATCH_ENDED');
  const ranking = end?.ranking ?? [];
  const winner = ranking[0];

  const partsOf = new Map(ranking.map((r) => [r.player, netWorthParts(s, r.player)] as const));
  const scale = Math.max(1, ...ranking.map((r) => { const p = partsOf.get(r.player)!; return p.cash + p.property + p.upgrades + p.debt + p.credit; }));

  // Tracking-sheet counts derived from the event log (Paper Playtest Kit Part 4).
  const stat = (id: PlayerId) => ({
    owned: Object.entries(s.ownership).filter(([, o]) => o === id).length,
    sets: PROPERTY_CATEGORIES.filter((c) => categoryTiles(s.board, c).every((i) => s.ownership[i] === id)).length,
    debtEver: s.eventLog.some((e) => e.type === 'DEBT_INCURRED' && e.player === id),
    received: s.eventLog.filter((e) => e.type === 'LEVERAGE_TOKEN_GRANTED' && e.player === id).length,
    spentTokens: s.eventLog.filter((e) => e.type === 'LEVERAGE_TOKEN_USED' && e.player === id).length,
  });
  const auctions = s.eventLog.filter((e) => e.type === 'AUCTION_OPENED').length;
  const zeroBid = s.eventLog.filter((e) => e.type === 'AUCTION_RESOLVED' && e.winner === null).length;

  // Podium: the winner large, the rest in ranking order.
  const podium = h('div', { class: 'podium' },
    winner
      ? h('div', { class: 'podium-winner' },
          token(view, winner.player, { size: 'lg' }),
          h('h1', { class: 'podium-title' }, `${nameOf(view, winner.player).toUpperCase()} WINS THE DISTRICT`),
          h('div', { class: 'podium-nw' }, `Net worth ${money(winner.netWorth)}`),
        )
      : null,
    ranking.length > 1
      ? h('div', { class: 'podium-others' }, ...ranking.slice(1).map((r) => h('span', { class: 'podium-other' }, token(view, r.player, { size: 'md' }), ` ${nameOf(view, r.player)} `, h('span', { class: 'num' }, money(r.netWorth)))))
      : null,
  );

  const rows = ranking.map((r, i) => {
    const st = stat(r.player);
    return h('tr', { class: i === 0 ? 'winner' : '', 'data-player': r.player },
      h('td', { class: 'num' }, `${i + 1}`),
      h('td', {}, token(view, r.player, { size: 'sm', withName: true })),
      h('td', { class: 'num nw' }, money(r.netWorth)),
      h('td', { class: 'bar-cell' }, netWorthBar(partsOf.get(r.player)!, scale)),
      h('td', { class: 'num' }, String(st.owned)),
      h('td', { class: 'num' }, String(st.sets)),
    );
  });

  const legend = h('div', { class: 'nw-legend' },
    ...(Object.keys(PART_LABEL) as (keyof NetWorthParts)[]).map((k) => h('span', { class: 'legend-item' }, h('span', { class: `swatch ${k}` }), PART_LABEL[k])),
  );

  // Kit tracking sheet (Part 4) kept for playtest notes, collapsed under the spec table.
  const tracking = h('details', { class: 'tracking' },
    h('summary', { class: 'muted small' }, 'Playtest tracking'),
    h('table', { class: 'small' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Player'), h('th', {}, 'Cash'), h('th', {}, 'Property'), h('th', {}, 'Upgrades'), h('th', {}, 'Debt'), h('th', {}, 'Credit'), h('th', {}, 'Ever in debt?'), h('th', {}, 'Leverage got / used'))),
      h('tbody', {}, ...ranking.map((r) => {
        const p = partsOf.get(r.player)!;
        const st = stat(r.player);
        return h('tr', {}, h('td', {}, nameOf(view, r.player)), h('td', { class: 'num' }, money(p.cash)), h('td', { class: 'num' }, money(p.property)), h('td', { class: 'num' }, money(p.upgrades)), h('td', { class: 'num' }, money(p.debt)), h('td', { class: 'num' }, money(p.credit)), h('td', {}, st.debtEver ? 'yes' : 'no'), h('td', { class: 'num' }, `${st.received} / ${st.spentTokens}`));
      })),
    ),
  );

  return h('div', { class: 'layout' },
    h('section', { class: 'card results' },
      podium,
      h('p', { class: 'muted small' }, 'Highest net worth after 12 rounds. Net worth = cash + property prices paid + upgrades paid − debt − credit line.'),
      h('div', { class: 'table-wrap' },
        h('table', { class: 'scoreboard' },
          h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Player'), h('th', {}, 'Net worth'), h('th', {}, 'cash | property | upgrades | −debt | −credit'), h('th', {}, 'Owned'), h('th', {}, 'Sets'))),
          h('tbody', {}, ...rows),
        ),
      ),
      legend,
      tracking,
      h('p', { class: 'muted small' }, `Auctions ${auctions} (nobody bid ${zeroBid}) · seed ${snap.seed} · ${snap.commandCount} commands`),
      h('div', { class: 'row' },
        h('button', { class: 'primary big', click: () => host.abandon() }, '▶ Play again'),
        h('button', { class: 'secondary', click: () => copyLog(host) }, 'Copy event log'),
      ),
    ),
    renderLog(s.eventLog, view),
  );
}
