import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyCommand, upgradeCost } from '../src/engine.ts';
import { yieldFor } from '../src/internal.ts';
import { actions, active, apply, eventsOf, moveBy, mustFail, own, patchPlayer, player, started } from './helpers.ts';
import type { GameState } from '../src/types.ts';

// --- Upgrades ---------------------------------------------------------------

test('upgrades: cost and yield per tier; max 2 levels; both levels cost the same', () => {
  const s0 = started();
  const id = active(s0);
  let s = actions(own(own(own(s0, id, 1), id, 2), id, 6)); // T1, T2, T3
  assert.equal(upgradeCost(s, 1, false), 50);
  assert.equal(upgradeCost(s, 2, false), 90);
  assert.equal(upgradeCost(s, 6, false), 130);

  const r1 = apply(s, { type: 'UPGRADE_PROPERTY', by: id, tileIndex: 6 });
  assert.equal(player(r1.state, id).cash, 1200 - 130);
  assert.equal(r1.state.upgrades[6], 1);
  assert.equal(r1.state.upgradeSpend[6], 130);
  assert.equal(yieldFor(r1.state, 6), 50 + 30);
  const ev = eventsOf(r1.events, 'PROPERTY_UPGRADED')[0]!;
  assert.deepEqual({ level: ev.level, cost: ev.cost, disc: ev.exchangeDiscount }, { level: 1, cost: 130, disc: false });

  // Second level next turn: same cost.
  s = actions(r1.state);
  const r2 = apply(s, { type: 'UPGRADE_PROPERTY', by: id, tileIndex: 6 });
  assert.equal(r2.state.upgrades[6], 2);
  assert.equal(r2.state.upgradeSpend[6], 260);
  assert.equal(yieldFor(r2.state, 6), 50 + 60);
  s = actions(r2.state);
  assert.equal(mustFail(applyCommand(s, { type: 'UPGRADE_PROPERTY', by: id, tileIndex: 6 })), 'UPGRADE_NOT_ALLOWED');

  assert.equal(yieldFor(own(s0, id, 1, 100, 2), 1), 15 + 18);
  assert.equal(yieldFor(own(s0, id, 2, 180, 1), 2), 30 + 18);
});

test('upgrades: one per turn; only on owned property; only after moving; needs cash', () => {
  const s0 = started();
  const id = active(s0);
  const s = actions(own(own(s0, id, 1), id, 3));
  const r = apply(s, { type: 'UPGRADE_PROPERTY', by: id, tileIndex: 1 });
  assert.equal(mustFail(applyCommand(r.state, { type: 'UPGRADE_PROPERTY', by: id, tileIndex: 3 })), 'UPGRADE_NOT_ALLOWED');
  assert.equal(mustFail(applyCommand(s, { type: 'UPGRADE_PROPERTY', by: id, tileIndex: 5 })), 'UPGRADE_NOT_ALLOWED');
  assert.equal(mustFail(applyCommand(s, { type: 'UPGRADE_PROPERTY', by: id, tileIndex: 4 })), 'UPGRADE_NOT_ALLOWED');
  assert.equal(mustFail(applyCommand(patchPlayer(s, id, { cash: 49 }), { type: 'UPGRADE_PROPERTY', by: id, tileIndex: 1 })), 'INSUFFICIENT_FUNDS');
  const preMove = own(s0, id, 1); // still at the roll step
  assert.equal(mustFail(applyCommand(preMove, { type: 'UPGRADE_PROPERTY', by: id, tileIndex: 1 })), 'WRONG_PHASE');
});

test('upgrades: a player in debt may still upgrade (agency preserved)', () => {
  const s0 = started();
  const id = active(s0);
  const s = actions(patchPlayer(own(s0, id, 1), id, { debt: 900 }));
  apply(s, { type: 'UPGRADE_PROPERTY', by: id, tileIndex: 1 });
});

test('exchange: landing grants a 20%-off upgrade this turn, which counts as the turn\'s one upgrade', () => {
  const s0 = started();
  const id = active(s0);
  const landed = moveBy(own(own(s0, id, 6), id, 1), 15, 1); // 15 → 16 Exchange
  assert.equal(eventsOf(landed.events, 'EXCHANGE_DISCOUNT_GRANTED').length, 1);
  assert.equal(landed.state.phase.kind === 'turn' && landed.state.phase.step.kind === 'actions' && landed.state.phase.step.exchangeDiscount, true);
  assert.equal(upgradeCost(landed.state, 6, true), 104);
  assert.equal(upgradeCost(landed.state, 1, true), 40);
  assert.equal(upgradeCost(landed.state, 2, true), 72);
  const r = apply(landed.state, { type: 'UPGRADE_PROPERTY', by: id, tileIndex: 6 });
  assert.equal(player(r.state, id).cash, 1200 - 104);
  assert.equal(r.state.upgradeSpend[6], 104);
  assert.equal(eventsOf(r.events, 'PROPERTY_UPGRADED')[0]!.exchangeDiscount, true);
  assert.equal(r.state.phase.kind === 'turn' && r.state.phase.step.kind === 'actions' && r.state.phase.step.exchangeDiscount, false);
  assert.equal(mustFail(applyCommand(r.state, { type: 'UPGRADE_PROPERTY', by: id, tileIndex: 1 })), 'UPGRADE_NOT_ALLOWED');
});

// --- Payments / cap / debt --------------------------------------------------

function landOnOwned(s0: GameState, owner: string, tile: number, from: number, steps: number) {
  return moveBy(own(s0, owner, tile), from, steps);
}

test('payment: landing on another player\'s property pays its yield in full when under the cap', () => {
  const s0 = started();
  const id = active(s0);
  const owner = s0.players.find((p) => p.id !== id)!.id;
  const r = landOnOwned(s0, owner, 6, 5, 1); // Helix Reactor ₵50
  const pay = eventsOf(r.events, 'PAYMENT_MADE')[0]!;
  assert.deepEqual({ from: pay.from, to: pay.to, requested: pay.requested, paid: pay.paid, capped: pay.capped, reason: pay.reason }, { from: id, to: owner, requested: 50, paid: 50, capped: false, reason: 'yield' });
  assert.equal(player(r.state, id).cash, 1150);
  assert.equal(player(r.state, owner).cash, 1250);
  assert.equal(eventsOf(r.events, 'DEBT_INCURRED').length, 0);
});

test('cap: no single payment takes more than floor(25% of cash); the rest becomes debt', () => {
  const s0 = started();
  const id = active(s0);
  const owner = s0.players.find((p) => p.id !== id)!.id;
  // Owner has the full Energy set (6, 14, 22), tile 6 upgraded twice: (50+60)×2 = 220 yield.
  let s = own(own(own(s0, owner, 6, 260, 2, 260), owner, 14), owner, 22);
  s = patchPlayer(s, id, { cash: 203 }); // cap = floor(203/4) = 50
  const r = moveBy(s, 5, 1);
  const pay = eventsOf(r.events, 'PAYMENT_MADE')[0]!;
  assert.deepEqual({ requested: pay.requested, paid: pay.paid, capped: pay.capped }, { requested: 220, paid: 50, capped: true });
  assert.equal(player(r.state, id).cash, 153);
  assert.equal(player(r.state, id).debt, 170);
  assert.equal(eventsOf(r.events, 'DEBT_INCURRED')[0]!.amount, 170);
  assert.equal(player(r.state, owner).cash, 1250);
});

test('cap: with ₵0 cash the player pays ₵0 and the whole yield becomes debt', () => {
  const s0 = started();
  const id = active(s0);
  const owner = s0.players.find((p) => p.id !== id)!.id;
  const r = moveBy(patchPlayer(own(s0, owner, 6), id, { cash: 0 }), 5, 1);
  assert.equal(player(r.state, id).cash, 0);
  assert.equal(player(r.state, id).debt, 50);
  assert.equal(player(r.state, owner).cash, 1200);
});

test('income: 50% of incoming money (rounded down) repays ordinary debt, the rest is cash', () => {
  const s0 = started();
  const id = active(s0);
  // Hub bonus while in ₵1,000 debt: 75 → debt, 75 → cash.
  const r = moveBy(patchPlayer(s0, id, { debt: 1000, cash: 0 }), 22, 3);
  assert.equal(player(r.state, id).debt, 925);
  assert.equal(player(r.state, id).cash, 75);
  const repaid = eventsOf(r.events, 'DEBT_REPAID')[0]!;
  assert.deepEqual({ amount: repaid.amount, source: repaid.source }, { amount: 75, source: 'hub' });

  // Debt smaller than half the income: only the outstanding debt is repaid.
  const r2 = moveBy(patchPlayer(s0, id, { debt: 20, cash: 0 }), 22, 3);
  assert.equal(player(r2.state, id).debt, 0);
  assert.equal(player(r2.state, id).cash, 130);

  // Yield received applies the same rule to the recipient; odd amounts round down.
  const owner = s0.players.find((p) => p.id !== id)!.id;
  const r3 = moveBy(patchPlayer(own(s0, owner, 1), owner, { debt: 100, cash: 0 }), 0, 1); // ₵15 → 7 debt, 8 cash
  assert.equal(player(r3.state, owner).debt, 93);
  assert.equal(player(r3.state, owner).cash, 8);
});

test('set bonus: owning all three of a category doubles the total yield including upgrades', () => {
  const s0 = started();
  const owner = s0.players[1]!.id;
  const two = own(own(s0, owner, 1), owner, 9);
  assert.equal(yieldFor(two, 1), 15);
  const three = own(two, owner, 17, 260, 1, 130);
  assert.equal(yieldFor(three, 1), 30);
  assert.equal(yieldFor(three, 17), (50 + 30) * 2);
});

test('set bonus × pulse: (base + upgrades) × set × pulse, floored once at the end', () => {
  const s0 = started();
  const owner = s0.players[1]!.id;
  const set = own(own(own(s0, owner, 2), owner, 10, 100, 1, 50), owner, 18); // Tech set; tile 10 = 15+9 = 24
  const boosted: GameState = { ...set, cityPulse: { ...set.cityPulse, active: { round: 4, boosted: 'Tech', suppressed: 'Industry' } } };
  assert.equal(yieldFor(boosted, 10), Math.floor((24 * 2 * 3) / 2)); // 72
  assert.equal(yieldFor(boosted, 2), Math.floor((30 * 2 * 3) / 2)); // 90
  const suppressed: GameState = { ...set, cityPulse: { ...set.cityPulse, active: { round: 4, boosted: 'Leisure', suppressed: 'Tech' } } };
  assert.equal(yieldFor(suppressed, 10), Math.floor((24 * 2 * 3) / 5)); // 28.8 → 28
  // Without the set: 15 × 0.6 = 9; 15 × 1.5 = 22.5 → 22.
  const single = own(s0, owner, 10);
  assert.equal(yieldFor({ ...single, cityPulse: suppressed.cityPulse }, 10), 9);
  assert.equal(yieldFor({ ...single, cityPulse: boosted.cityPulse }, 10), 22);
});

test('audit: landing pays floor(8% of cash) to the bank', () => {
  const s0 = started();
  const id = active(s0);
  const r = moveBy(patchPlayer(s0, id, { cash: 1111 }), 7, 1); // 7 → 8 Audit; 88.88 → 88
  const pay = eventsOf(r.events, 'PAYMENT_MADE')[0]!;
  assert.deepEqual({ to: pay.to, paid: pay.paid, reason: pay.reason }, { to: null, paid: 88, reason: 'audit' });
  assert.equal(player(r.state, id).cash, 1023);
});

test('windfall: +₵100, or +₵250 if last place by Net Worth (ties count as last)', () => {
  const s0 = started();
  const id = active(s0);
  const other = s0.players.find((p) => p.id !== id)!.id;
  // Everyone equal → the mover is (tied) last → 250.
  const tied = moveBy(s0, 19, 1);
  assert.equal(eventsOf(tied.events, 'WINDFALL_RECEIVED')[0]!.amount, 250);
  assert.equal(player(tied.state, id).cash, 1450);
  // Mover is ahead → 100.
  const ahead = moveBy(patchPlayer(s0, other, { cash: 1100 }), 19, 1);
  const ev = eventsOf(ahead.events, 'WINDFALL_RECEIVED')[0]!;
  assert.deepEqual({ amount: ev.amount, wasLast: ev.wasLast }, { amount: 100, wasLast: false });
  // Debt counts against Net Worth: mover with debt is last even with equal cash.
  const behind = moveBy(patchPlayer(s0, id, { debt: 10 }), 19, 1);
  assert.equal(eventsOf(behind.events, 'WINDFALL_RECEIVED')[0]!.wasLast, true);
});
