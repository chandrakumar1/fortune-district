/**
 * Action-model test (DOM-less): renders every screen of a scripted match with
 * the real renderer against a tiny fake DOM, clicks every button through a
 * dispatch spy, and asserts:
 *   1. every command a button would dispatch is in `legalCommands`;
 *   2. every legal command type is reachable from some button;
 *   3. exactly one primary button exists on every decision screen;
 *   4. all screens render without throwing (catches broken module splits).
 * Guards the spec's core rule — the engine is the sole source of legal actions.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Command } from '../src/engine.ts';
import { Host } from '../src/host.ts';
import type { Snapshot } from '../src/host.ts';

// ---------------------------------------------------------------------------
// Minimal fake DOM — just enough for ui/dom.ts and the renderers.
// ---------------------------------------------------------------------------

class FakeNode {
  tag: string;
  children: FakeNode[] = [];
  parent: FakeNode | null = null;
  text = '';
  constructor(tag: string) {
    this.tag = tag;
  }
  get textContent(): string {
    return this.tag === '#text' ? this.text : this.children.map((c) => c.textContent).join('');
  }
  set textContent(v: string) {
    this.children = [];
    this.text = v;
  }
}

class FakeElement extends FakeNode {
  attrs = new Map<string, string>();
  hidden = false;
  get tagName(): string {
    return this.tag.toUpperCase();
  }
  hasAttribute(k: string): boolean {
    return this.attrs.has(k);
  }
  handlers = new Map<string, ((ev: unknown) => void)[]>();
  dataset: Record<string, string> = {};
  style = { setProperty: () => {} } as unknown as string;
  value = '';
  classList = {
    add: (c: string) => this.setAttribute('class', `${this.getAttribute('class') ?? ''} ${c}`.trim()),
    remove: (c: string) => this.setAttribute('class', (this.getAttribute('class') ?? '').split(' ').filter((x) => x !== c).join(' ')),
    contains: (c: string) => (this.getAttribute('class') ?? '').split(' ').includes(c),
  };
  append(...nodes: (FakeNode | string)[]): void {
    for (const n of nodes) {
      const node = typeof n === 'string' ? text(n) : n;
      node.parent = this;
      this.children.push(node);
      if (this.tag === 'select' && node.tag === 'option' && this.value === '') this.value = (node as FakeElement).getAttribute('value') ?? '';
    }
  }
  replaceChildren(...nodes: FakeNode[]): void {
    this.children = [];
    this.append(...nodes);
  }
  replaceWith(node: FakeNode): void {
    if (!this.parent) return;
    const i = this.parent.children.indexOf(this);
    node.parent = this.parent;
    this.parent.children.splice(i, 1, node);
  }
  remove(): void {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
  }
  setAttribute(k: string, v: string): void {
    this.attrs.set(k, v);
    if (k === 'value') this.value = v;
  }
  getAttribute(k: string): string | null {
    return this.attrs.get(k) ?? null;
  }
  removeAttribute(k: string): void {
    this.attrs.delete(k);
  }
  addEventListener(type: string, fn: (ev: unknown) => void): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]);
  }
  click(): void {
    for (const fn of this.handlers.get('click') ?? []) fn({});
  }
  focus(): void {}
  querySelectorAll(): FakeElement[] {
    return [];
  }
  #html = '';
  set innerHTML(v: string) {
    this.#html = v;
    this.children = [];
  }
  get innerHTML(): string {
    return this.#html;
  }
}

function text(s: string): FakeNode {
  const n = new FakeNode('#text');
  n.text = s;
  return n;
}

function hasClass(el: FakeElement, c: string): boolean {
  return (el.getAttribute('class') ?? '').split(/\s+/).includes(c);
}

/**
 * Board assertions on a playing screen: 24 keyed parcels 0..23, ribbons match
 * authoritative ownership, tokens sit in the parcel of each player's position.
 */
function assertBoard(root: FakeElement, snap: Snapshot): void {
  const state = snap.view!.state;
  const parcels = all(root, (el) => hasClass(el, 'parcel'));
  assert.equal(parcels.length, 24, 'exactly 24 parcels');
  const keys = parcels.map((p) => p.dataset['key']).sort((a, b) => Number(a) - Number(b));
  assert.deepEqual(keys, Array.from({ length: 24 }, (_, i) => String(i)), 'data-key values are exactly 0..23');
  assert.equal(new Set(keys).size, 24, 'parcel keys are unique');
  for (const p of parcels) {
    const i = Number(p.dataset['key']);
    assert.equal(p.getAttribute('data-index'), String(i));
    const tile = state.board[i]!;
    const owner = state.ownership[i];
    const ribbon = all(p, (el) => hasClass(el, 'ribbon'))[0];
    assert.ok(ribbon, `parcel ${i} has a ribbon`);
    if (owner !== undefined) {
      const name = state.players.find((x) => x.id === owner)!.displayName;
      assert.ok(ribbon.textContent.includes(owner === snap.keyboard ? 'YOU' : name), `parcel ${i} ribbon shows its owner (${ribbon.textContent})`);
      assert.ok(hasClass(p, 'owned'));
      assert.equal(hasClass(p, 'mine'), owner === snap.keyboard);
    } else {
      assert.equal(ribbon.textContent, tile.kind === 'property' ? 'for sale' : '', `parcel ${i} unowned ribbon`);
      assert.ok(!hasClass(p, 'owned') && !hasClass(p, 'mine'));
    }
    assert.equal(hasClass(p, 'corner'), i % 4 === 0);
    assert.equal(hasClass(p, 'special'), tile.kind !== 'property');
    // Tokens in this parcel are exactly the players standing on tile i.
    const here = all(p, (el) => hasClass(el, 'token')).map((t) => t.getAttribute('title'));
    const expected = state.players.filter((x) => x.position === i).map((x) => x.displayName).sort();
    assert.deepEqual([...here].sort(), expected, `tokens on parcel ${i}`);
  }
}

/**
 * Decision-surface assertions (Phase 2): player cards replace the table; the
 * keyboard holder's card carries YOU; the status bar names the active player and
 * the round; the active token carries a timer ring; every legal upgrade has its
 * own row button; the action panel exists exactly once.
 */
function assertDecisionSurface(root: FakeElement, snap: Snapshot): void {
  const state = snap.view!.state;
  const me = state.players.find((p) => p.id === snap.keyboard)!;
  assert.equal(all(root, (el) => el.tag === 'table').length, 0, 'no player table on playing screens');
  const cards = all(root, (el) => hasClass(el, 'player-card'));
  assert.equal(cards.length, state.players.length, 'one player card per player');
  const meCard = cards.find((c) => hasClass(c, 'me'));
  assert.ok(meCard && meCard.textContent.includes('YOU') && meCard.textContent.includes(me.displayName), 'self card is marked YOU');
  for (const p of state.players) {
    const card = cards.find((c) => c.textContent.includes(p.displayName))!;
    assert.ok(card, `card for ${p.displayName}`);
    // Debt / credit chips only when non-zero.
    assert.equal(card.textContent.includes('Debt'), p.debt > 0, `debt chip for ${p.displayName}`);
    assert.equal(card.textContent.includes('Credit'), p.creditLine > 0, `credit chip for ${p.displayName}`);
  }
  const bar = all(root, (el) => hasClass(el, 'statusbar'))[0];
  assert.ok(bar, 'status bar present');
  assert.ok(bar.textContent.includes(`Round ${state.round}`) && bar.textContent.includes(`${me.displayName}'s turn`), 'status bar names round and player');
  assert.equal(all(bar, (el) => hasClass(el, 'round-rail')).length, 1, 'round rail');
  assert.equal(all(bar, (el) => hasClass(el, 'seg')).length, 12, '12 round segments');
  assert.ok(all(root, (el) => hasClass(el, 'timer-ring')).length >= 2, 'timer ring in the status bar and on the action panel');
  assert.equal(all(root, (el) => hasClass(el, 'action-panel')).length, 1, 'exactly one action panel');
  if (state.phase.kind === 'turn' && state.phase.step.kind === 'actions') {
    const legalUpgrades = snap.legal.filter((c) => c.type === 'UPGRADE_PROPERTY').length;
    assert.equal(all(root, (el) => hasClass(el, 'upgrade-row') && !hasClass(el, 'disabled-row')).length, legalUpgrades, 'one live upgrade row per legal upgrade');
  }
}

/**
 * Beginner layer (Phase 4, spec §11 / §2.5): the ? button is on every playing
 * screen; every disabled control says why (engine reason via host.explain);
 * owned parcels without a legal upgrade appear as disabled rows; Leverage
 * options are all shown (live or disabled with reason) when a token is held;
 * every dotted term carries a tooltip; at most one callout per screen.
 */
function assertBeginnerLayer(root: FakeElement, snap: Snapshot, callouts: FakeElement[]): FakeElement | null {
  const state = snap.view!.state;
  const me = snap.keyboard!;
  const bar = all(root, (el) => hasClass(el, 'statusbar'))[0]!;
  assert.equal(all(bar, (el) => hasClass(el, 'rules-btn')).length, 1, 'persistent ? in the status bar');
  for (const t of all(root, (el) => hasClass(el, 'term'))) assert.ok((t.getAttribute('data-tip') ?? '').length > 10, 'term has a tooltip');
  for (const b of all(root, (el) => el.tag === 'button' && el.attrs.has('disabled'))) {
    const rowReason = all(b.parent as FakeElement, (el) => hasClass(el, 'reason'))[0];
    const isDice = (b.textContent ?? '').startsWith('Move'); // dice reveal delay, not a rule
    if (!isDice) assert.ok((b.getAttribute('data-tip') ?? '').length > 5 && rowReason && rowReason.textContent.length > 5, `disabled control says why (${b.textContent})`);
  }
  if (state.phase.kind === 'turn' && state.phase.step.kind === 'actions') {
    const owned = Object.entries(state.ownership).filter(([, o]) => o === me).length;
    const legalUpgrades = snap.legal.filter((c) => c.type === 'UPGRADE_PROPERTY').length;
    assert.equal(all(root, (el) => hasClass(el, 'upgrade-row') && hasClass(el, 'disabled-row')).length, owned - legalUpgrades, 'one disabled row per owned parcel without a legal upgrade');
    const my = state.players.find((p) => p.id === me)!;
    if (my.leverageTokens > 0) assert.equal(all(root, (el) => hasClass(el, 'lev-card')).length, 2, 'both Leverage options shown (live or disabled with reason)');
  }
  assert.ok(callouts.length <= 1, 'at most one callout per screen');
  if (callouts[0]) {
    const dismiss = all(callouts[0], (el) => el.tag === 'button');
    assert.equal(dismiss.length, 1);
    assert.ok(!(dismiss[0]!.getAttribute('class') ?? '').includes('primary'), 'callout dismiss is not a primary');
  }
  return callouts[0] ?? null;
}

/** Clicking ? opens the rules card (with the Net Worth formula) over the page; ✕ closes it. Neither dispatches. */
function assertRulesCard(root: FakeElement, body: FakeElement): void {
  const btn = all(root, (el) => hasClass(el, 'rules-btn'))[0]!;
  btn.click();
  const overlay = all(body, (el) => hasClass(el, 'rules-overlay'));
  assert.equal(overlay.length, 1, 'rules card opened');
  const text = overlay[0]!.textContent;
  assert.ok(text.includes('Net worth = cash + property prices paid + upgrades paid − debt − credit line.'), 'rules card states the net worth formula');
  assert.ok(text.includes('How Fortune District works') && text.includes('City Pulse') && text.includes('Leverage') && text.includes('Auctions'), 'rules card sections');
  btn.click(); // second click while open: no second overlay
  assert.equal(all(body, (el) => hasClass(el, 'rules-overlay')).length, 1);
  all(overlay[0]!, (el) => hasClass(el, 'rules-close'))[0]!.click();
  assert.equal(all(body, (el) => hasClass(el, 'rules-overlay')).length, 0, 'rules card closed');
}

/** Spec §2.1 / §7 identity palette, by seat: Crimson ■, Azure ●, Emerald ▲, Violet ◆. */
const SPEC_IDENTITIES = [
  ['#E5484D', '■'],
  ['#22A6F0', '●'],
  ['#2FBF71', '▲'],
  ['#9B6DFF', '◆'],
] as const;

/** Every token on the screen carries its player's seat colour and symbol (Phase 3 palette). */
function assertIdentityPalette(root: FakeElement, snap: Snapshot): void {
  const state = snap.view!.state;
  const tokens = all(root, (el) => hasClass(el, 'token'));
  assert.ok(tokens.length > 0, 'tokens rendered');
  for (const t of tokens) {
    const p = state.players.find((x) => x.displayName === t.getAttribute('title'));
    assert.ok(p, `token title names a player (${t.getAttribute('title')})`);
    const [hex, symbol] = SPEC_IDENTITIES[p.seat]!;
    assert.ok((t.getAttribute('style') ?? '').includes(`--c:${hex}`), `token for seat ${p.seat} uses ${hex}`);
    assert.ok(t.textContent.startsWith(symbol), `token for seat ${p.seat} shows ${symbol}`);
  }
}

/**
 * Results screen (spec §4 P): podium in ranking order, one scoreboard row per
 * player, and each Net Worth bar's segments sum (signed) to the engine's figure.
 */
function assertResults(root: FakeElement, snap: Snapshot): void {
  const state = snap.view!.state;
  const end = state.eventLog.find((e) => e.type === 'MATCH_ENDED');
  assert.ok(end && end.type === 'MATCH_ENDED', 'MATCH_ENDED in the log');
  const ranking = end.ranking;
  assert.equal(all(root, (el) => hasClass(el, 'podium')).length, 1, 'one podium');
  const winnerBox = all(root, (el) => hasClass(el, 'podium-winner'))[0]!;
  const winnerName = state.players.find((p) => p.id === ranking[0]!.player)!.displayName;
  assert.ok(winnerBox.textContent.includes(`${winnerName.toUpperCase()} WINS THE DISTRICT`), 'podium names the engine\'s winner');
  assert.ok(winnerBox.textContent.includes(String(ranking[0]!.netWorth.toLocaleString('en-US'))), 'podium shows the winner\'s net worth');
  assert.equal(all(root, (el) => hasClass(el, 'podium-other')).length, ranking.length - 1, 'runners-up on the podium');
  const rows = all(root, (el) => el.tag === 'tr' && el.getAttribute('data-player') !== null);
  assert.deepEqual(rows.map((r) => r.getAttribute('data-player')), ranking.map((r) => r.player), 'scoreboard rows follow the engine ranking');
  for (const r of ranking) {
    const row = rows.find((x) => x.getAttribute('data-player') === r.player)!;
    const segs = all(row, (el) => hasClass(el, 'seg'));
    let signed = 0;
    for (const s of segs) {
      const part = s.getAttribute('data-part')!;
      const amount = Number(s.getAttribute('data-amount'));
      assert.ok(amount > 0, 'only non-zero segments are drawn');
      signed += part === 'debt' || part === 'credit' ? -amount : amount;
    }
    assert.equal(signed, r.netWorth, `bar segments sum to the engine's net worth for ${r.player}`);
    assert.equal(signed, snap.netWorth[r.player], `bar matches snapshot net worth for ${r.player}`);
  }
  assertIdentityPalette(root, snap);
}

function all(node: FakeNode, pred: (el: FakeElement) => boolean, out: FakeElement[] = []): FakeElement[] {
  for (const c of node.children) {
    if (c instanceof FakeElement) {
      if (pred(c)) out.push(c);
      all(c, pred, out);
    }
  }
  return out;
}

const fakeBody = new FakeElement('body');
(globalThis as unknown as { document: unknown }).document = {
  createElement: (tag: string) => new FakeElement(tag),
  createTextNode: (s: string) => text(s),
  body: fakeBody,
};
(globalThis as unknown as { confirm: () => boolean }).confirm = () => false;
(globalThis as unknown as { alert: () => void }).alert = () => {};
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async () => {} } }, configurable: true });
(globalThis as unknown as { window: unknown }).window = { open: () => null };
const storage = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => {
    storage.set(k, v);
  },
  removeItem: (k: string) => {
    storage.delete(k);
  },
};

const { render } = await import('../src/render.ts');
const { revealedRolls } = await import('../src/ui/dice.ts');

// ---------------------------------------------------------------------------

function canon(c: Command): string {
  return JSON.stringify(c, Object.keys(c).sort());
}

/** Render `snap`, click every button through a spy, return what they would dispatch and the primaries. */
function probe(host: Host, snap: Snapshot): { dispatched: Command[]; primaries: number; buttons: number; root: FakeElement; callouts: FakeElement[] } {
  const root = new FakeElement('div');
  const dispatched: Command[] = [];
  const real = host.dispatch.bind(host);
  (host as unknown as { dispatch: (c: Command) => boolean }).dispatch = (c: Command) => {
    dispatched.push(c);
    return false; // never mutate during the probe
  };
  const ready = host.ready.bind(host);
  const pass = host.pass.bind(host);
  const abandon = host.abandon.bind(host);
  (host as unknown as { ready: () => void }).ready = () => {};
  (host as unknown as { pass: () => void }).pass = () => {};
  (host as unknown as { abandon: () => void }).abandon = () => {};
  try {
    // Skip the dice animation so the Move button is enabled.
    const rolled = [...snap.events].reverse().find((e) => e.type === 'DICE_ROLLED');
    if (rolled) revealedRolls.add(rolled.seq);
    render(root as unknown as HTMLElement, snap, host, 'change');
    const buttons = all(root, (el) => el.tag === 'button');
    // Callouts are captured before clicking: "Got it" removes them from the tree.
    const callouts = all(root, (el) => hasClass(el, 'callout'));
    for (const b of buttons) if (!b.attrs.has('disabled')) b.click();
    const primaries = buttons.filter((b) => (b.getAttribute('class') ?? '').includes('primary')).length;
    return { dispatched, primaries, buttons: buttons.length, root, callouts };
  } finally {
    (host as unknown as { dispatch: typeof real }).dispatch = real;
    (host as unknown as { ready: typeof ready }).ready = ready;
    (host as unknown as { pass: typeof pass }).pass = pass;
    (host as unknown as { abandon: typeof abandon }).abandon = abandon;
  }
}

test('action model: every rendered button maps to a legal command; every legal type is reachable; one primary per decision', async (t) => {
  storage.clear();
  const host = new Host({ decisionSeconds: null, auctionSeconds: null });
  let snap!: Snapshot;
  host.subscribe((s) => {
    snap = s;
  });
  host.newMatch(
    [
      { id: 'p1', displayName: 'Maya' },
      { id: 'p2', displayName: 'Ravi' },
      { id: 'p3', displayName: 'Lee' },
    ],
    2026,
  );

  let screens = 0;
  let decisionScreens = 0;
  let bidScreens = 0;
  let steps = 0;
  const seenLegalTypes = new Set<string>();
  const calloutsShown = new Map<string, number>();
  let rulesChecked = false;
  let disabledRows = 0;
  let disabledLeverage = 0;

  while (snap.phase !== 'ended' && steps++ < 5000) {
    // Hand-off screen: renders, has exactly one primary (Ready), dispatches nothing.
    if (snap.handoffTo) {
      const r = probe(host, snap);
      screens++;
      assert.equal(r.primaries, 1, 'hand-off has one primary');
      assert.equal(r.dispatched.length, 0, 'hand-off dispatches no commands');
      host.ready();
      continue;
    }

    // The host computes legality from the authoritative state (the view is redacted).
    const legal = snap.legal;
    const legalSet = new Set(legal.map(canon));
    for (const c of legal) seenLegalTypes.add(c.type === 'USE_LEVERAGE_TOKEN' ? `${c.type}:${c.payload.kind}` : c.type);

    const r = probe(host, snap);
    screens++;
    decisionScreens++;
    assertBoard(r.root, snap);
    assertDecisionSurface(r.root, snap);
    assertIdentityPalette(r.root, snap);
    const callout = assertBeginnerLayer(r.root, snap, r.callouts);
    disabledRows += all(r.root, (el) => hasClass(el, 'upgrade-row') && hasClass(el, 'disabled-row')).length;
    disabledLeverage += all(r.root, (el) => hasClass(el, 'lev-card') && hasClass(el, 'disabled-row')).length;
    if (callout) {
      const id = callout.getAttribute('data-callout')!;
      calloutsShown.set(id, (calloutsShown.get(id) ?? 0) + 1);
      // The probe clicked "Got it" (every button is clicked), so the callout is now recorded as seen for this "browser".
      assert.ok((storage.get('fortune-district.callouts.v1') ?? '').includes(id), 'dismissal recorded in localStorage');
    }
    if (!rulesChecked) {
      assertRulesCard(r.root, fakeBody);
      rulesChecked = true;
    }
    assert.equal(r.primaries, 1, `exactly one primary on a decision screen (got ${r.primaries}, step ${JSON.stringify(snap.view!.state.phase)})`);

    // 1. Every dispatched command is legal.
    for (const c of r.dispatched) assert.ok(legalSet.has(canon(c)), `button would dispatch an illegal command: ${canon(c)}`);
    // 2. Every legal command type has a button (auction: the bid button with the input's default amount).
    const dispatchedTypes = new Set(r.dispatched.map((c) => (c.type === 'USE_LEVERAGE_TOKEN' ? `${c.type}:${c.payload.kind}` : c.type)));
    for (const c of legal) {
      const k = c.type === 'USE_LEVERAGE_TOKEN' ? `${c.type}:${c.payload.kind}` : c.type;
      assert.ok(dispatchedTypes.has(k), `legal ${k} has no button on this screen`);
    }

    // Advance the match with a deterministic policy that exercises auctions, bids and passes.
    const bid = legal.find((c) => c.type === 'SUBMIT_SEALED_BID');
    if (bid) {
      bidScreens++;
      if (bidScreens % 2 === 0) host.pass();
      else host.dispatch(bid);
      continue;
    }
    const pick =
      legal.find((c) => c.type === 'ADVANCE') ??
      (steps % 3 === 0 ? legal.find((c) => c.type === 'DECLINE_PROPERTY') : legal.find((c) => c.type === 'BUY_PROPERTY')) ??
      legal.find((c) => c.type === 'DECLINE_PROPERTY') ??
      legal.find((c) => c.type === 'UPGRADE_PROPERTY') ??
      legal.find((c) => c.type === 'USE_LEVERAGE_TOKEN') ??
      legal.find((c) => c.type === 'REROLL_PULSE') ??
      legal.find((c) => c.type === 'END_TURN') ??
      legal[0]!;
    assert.ok(host.dispatch(pick), 'policy command must be accepted');
  }

  assert.equal(snap.phase, 'ended');
  // First-time callouts: each fired at most once across the whole match (once per browser), and at least three kinds fired.
  for (const [id, n] of calloutsShown) assert.equal(n, 1, `callout ${id} shown once`);
  assert.ok(calloutsShown.size >= 3, `callout coverage: ${[...calloutsShown.keys()].join(', ')}`);
  assert.ok(rulesChecked);
  assert.ok(disabledRows > 0 && disabledLeverage > 0, 'scripted match exercised disabled upgrade rows and disabled Leverage cards');
  t.diagnostic(`callouts fired once each: ${[...calloutsShown.keys()].join(', ')} · disabled upgrade rows: ${disabledRows} · disabled Leverage cards: ${disabledLeverage}`);
  // The results screen renders, has one primary, dispatches no game command, and its podium/bars match the engine.
  const end = probe(host, snap);
  assert.equal(end.primaries, 1);
  assert.equal(end.dispatched.length, 0, 'results screen dispatches no commands');
  assertResults(end.root, snap);
  assert.ok(screens > 100 && decisionScreens > 60 && bidScreens > 0, `coverage: ${screens} screens, ${decisionScreens} decisions, ${bidScreens} bids`);
  for (const t of ['ADVANCE', 'BUY_PROPERTY', 'DECLINE_PROPERTY', 'END_TURN', 'SUBMIT_SEALED_BID', 'UPGRADE_PROPERTY', 'USE_LEVERAGE_TOKEN:force_auction', 'USE_LEVERAGE_TOKEN:credit_line']) {
    assert.ok(seenLegalTypes.has(t), `scripted match never reached a screen offering ${t}`);
  }
});

test('setup screen renders with one primary and can only dispatch START_MATCH', () => {
  storage.clear();
  const host = new Host({ decisionSeconds: null, auctionSeconds: null });
  let snap!: Snapshot;
  host.subscribe((s) => {
    snap = s;
  });
  const r = probe(host, snap);
  assert.equal(snap.phase, 'setup');
  assert.equal(r.primaries, 1);
  // The only command the setup screen can issue is the host's own START_MATCH.
  assert.ok(r.dispatched.every((c) => c.type === 'START_MATCH' && c.by === 'host'));
});

test('host.explain is presentation-only: engine reason returned, authoritative state hash and snapshot unchanged, no notification', () => {
  storage.clear();
  const host = new Host({ decisionSeconds: null, auctionSeconds: null });
  let snap!: Snapshot;
  let notifications = 0;
  host.subscribe((s) => {
    snap = s;
    notifications++;
  });
  host.newMatch([{ id: 'p1', displayName: 'Maya' }, { id: 'p2', displayName: 'Ravi' }], 99);
  host.ready();
  const me = snap.keyboard!;
  const other = me === 'p1' ? 'p2' : 'p1';
  const before = host.stateHash();
  const snapBefore = JSON.stringify(snap);
  const n = notifications;

  const probes: Command[] = [
    { type: 'UPGRADE_PROPERTY', by: me, tileIndex: 1 },
    { type: 'USE_LEVERAGE_TOKEN', by: me, payload: { kind: 'credit_line' } },
    { type: 'USE_LEVERAGE_TOKEN', by: me, payload: { kind: 'force_auction', tileIndex: 1 } },
    { type: 'BUY_PROPERTY', by: me, tileIndex: 1 },
    { type: 'END_TURN', by: other },
    { type: 'SUBMIT_SEALED_BID', by: me, amount: 50 },
    { type: 'REROLL_PULSE', by: me },
  ];
  for (const c of probes) {
    const why = host.explain(c);
    assert.ok(why && why.code && why.message, `engine names a reason for ${c.type}`);
  }
  // A legal command explains as null — and is still NOT applied.
  const legal = snap.legal[0]!;
  assert.equal(host.explain(legal), null);
  for (let i = 0; i < 25; i++) host.explain(legal);

  assert.equal(host.stateHash(), before, 'authoritative state hash unchanged by explain()');
  assert.equal(JSON.stringify(snap), snapBefore, 'snapshot unchanged');
  assert.equal(notifications, n, 'explain() never notifies');
  assert.equal(host.explain({ type: 'START_MATCH', by: 'host' })?.code, 'MATCH_ALREADY_STARTED');
});
