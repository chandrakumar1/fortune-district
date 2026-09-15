import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyCommand, legalCommands, whoseDecision } from '../src/engine.ts';
import { actions, active, apply, eventsOf, moveBy, must, mustFail, patchPlayer, player, started, withDice } from './helpers.ts';

test('movement: the player moves forward by exactly the sum of the two dice', () => {
  const s = withDice(started(), [2, 5]);
  const id = active(s);
  const r = apply(s, { type: 'ADVANCE', by: id });
  assert.equal(player(r.state, id).position, 7);
  const mv = eventsOf(r.events, 'PLAYER_MOVED')[0]!;
  assert.deepEqual({ from: mv.from, to: mv.to, steps: mv.steps, dice: mv.dice }, { from: 0, to: 7, steps: 7, dice: [2, 5] });

  // Every combination moves by its sum, never by a single die.
  for (const dice of [[1, 1], [6, 6], [3, 4], [4, 3]] as const) {
    const t = apply(withDice(started(), dice), { type: 'ADVANCE', by: id });
    assert.equal(player(t.state, id).position, dice[0] + dice[1]);
  }
});

test('movement: ADVANCE is rejected out of turn or out of step; the only legal move is the sum', () => {
  const s = withDice(started(), [3, 4]);
  const id = active(s);
  const other = s.players.find((p) => p.id !== id)!.id;
  assert.equal(mustFail(applyCommand(s, { type: 'ADVANCE', by: other })), 'NOT_YOUR_TURN');
  assert.deepEqual(legalCommands(s, id), [{ type: 'ADVANCE', by: id }]);
  const moved = apply(s, { type: 'ADVANCE', by: id }).state;
  assert.equal(mustFail(applyCommand(moved, { type: 'ADVANCE', by: id })), 'WRONG_PHASE');
});

test('hub: passing tile 0 pays ₵150 once; landing exactly on it pays once; not passing pays nothing', () => {
  const s = started();
  const id = active(s);
  const pass = moveBy(s, 22, 4); // 22 → 2, passes Hub
  assert.equal(eventsOf(pass.events, 'HUB_BONUS_PAID').length, 1);
  assert.equal(player(pass.state, id).cash, 1200 + 150);

  const land = moveBy(s, 20, 4); // 20 → 0, lands on Hub
  assert.equal(eventsOf(land.events, 'HUB_BONUS_PAID').length, 1);
  assert.equal(player(land.state, id).cash, 1350);
  assert.equal(land.state.phase.kind === 'turn' && land.state.phase.step.kind, 'actions');

  const no = moveBy(s, 3, 1); // 3 → 4 (Pulse Relay), no Hub
  assert.equal(eventsOf(no.events, 'HUB_BONUS_PAID').length, 0);
  assert.equal(player(no.state, id).cash, 1200);
});

test('timeout: at the roll step the move still happens, by exactly the dice sum, and the destination resolves', () => {
  const s = withDice(started(), [3, 2]);
  const id = active(s);
  const r = apply(s, { type: 'TURN_TIMED_OUT', by: 'host' });
  assert.equal(eventsOf(r.events, 'TURN_TIMED_OUT')[0]!.step, 'roll');
  const mv = eventsOf(r.events, 'PLAYER_MOVED')[0]!;
  assert.equal(mv.steps, 5);
  assert.deepEqual(mv.dice, [3, 2]);
  assert.equal(player(r.state, id).position, 5);
  // Tile 5 is an unowned property → offered; a further timeout declines it.
  assert.equal(r.state.phase.kind === 'turn' && r.state.phase.step.kind, 'buy_or_decline');
  const r2 = apply(r.state, { type: 'TURN_TIMED_OUT', by: 'host' });
  assert.equal(eventsOf(r2.events, 'PROPERTY_DECLINED').length, 1);
  assert.equal(r2.state.phase.kind, 'auction');
});

test('timeout: in the action window the turn ends; only the host may time out', () => {
  const s = actions(started());
  const id = active(s);
  assert.equal(mustFail(applyCommand(s, { type: 'TURN_TIMED_OUT', by: id })), 'NOT_YOUR_TURN');
  const r = apply(s, { type: 'TURN_TIMED_OUT', by: 'host' });
  assert.equal(eventsOf(r.events, 'TURN_ENDED')[0]!.player, id);
  assert.notEqual(active(r.state), id);
});

test('turns: fixed seat order, one turn per player per round, ROUND_ENDED after the last seat', () => {
  let s = started(3);
  const order = s.players.map((p) => p.id);
  const seen: string[] = [];
  let roundEnded = 0;
  for (let i = 0; i < 3; i++) {
    seen.push(active(s));
    const r = apply(actions(s), { type: 'END_TURN', by: active(s) });
    roundEnded += eventsOf(r.events, 'ROUND_ENDED').length;
    s = r.state;
  }
  assert.deepEqual(seen, order);
  assert.equal(roundEnded, 1);
  assert.equal(s.round, 2);
  assert.equal(active(s), order[0]);
});

test('turns: END_TURN is rejected while a buy/decline decision is pending', () => {
  const s = withDice(started(), [1, 1]);
  const id = active(s);
  const r = apply(s, { type: 'ADVANCE', by: id }).state; // lands on tile 2, unowned
  assert.equal(mustFail(applyCommand(r, { type: 'END_TURN', by: id })), 'WRONG_PHASE');
});

test('legalCommands / whoseDecision reflect the current step', () => {
  const s = withDice(started(), [1, 6]);
  const id = active(s);
  assert.equal(whoseDecision(s), id);
  assert.deepEqual(legalCommands(s, id).map((c) => c.type), ['ADVANCE']);
  assert.deepEqual(legalCommands(s, 'host').map((c) => c.type), ['TURN_TIMED_OUT']);
  const other = s.players.find((p) => p.id !== id)!.id;
  assert.deepEqual(legalCommands(s, other), []);

  const offered = apply(s, { type: 'ADVANCE', by: id }).state; // 1 + 6 → tile 7, unowned
  assert.deepEqual(legalCommands(offered, id).map((c) => c.type), ['BUY_PROPERTY', 'DECLINE_PROPERTY']);
  const broke = patchPlayer(offered, id, { cash: 10 });
  assert.deepEqual(legalCommands(broke, id).map((c) => c.type), ['DECLINE_PROPERTY']);

  const acting = actions(s);
  assert.deepEqual(legalCommands(acting, id).map((c) => c.type), ['END_TURN']);
});

test('phases: any command after MATCH_ENDED is rejected', () => {
  let s = started(2);
  let guard = 0;
  while (s.phase.kind !== 'ended' && guard++ < 2000) {
    const who = whoseDecision(s)!;
    const cmds = legalCommands(s, who);
    // Always decline/end so the match runs fast; host closes auctions.
    const cmd = cmds.find((c) => c.type === 'DECLINE_PROPERTY' || c.type === 'END_TURN' || c.type === 'CLOSE_AUCTION') ?? cmds[0]!;
    s = must(applyCommand(s, cmd)).state;
  }
  assert.equal(s.phase.kind, 'ended');
  assert.equal(mustFail(applyCommand(s, { type: 'END_TURN', by: 'a' })), 'MATCH_ENDED');
  assert.equal(whoseDecision(s), null);
  assert.deepEqual(legalCommands(s, 'host'), []);
});
