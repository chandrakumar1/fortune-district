import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyCommand, computeNetWorth, hashState, legalCommands, whoseDecision } from '../src/engine.ts';
import { actions, active, apply, eventsOf, moveBy, must, mustFail, own, patchPlayer, player, started, withDice } from './helpers.ts';
import type { Command, GameState } from '../src/types.ts';

/** End every remaining turn of the current round with END_TURN (from the action window). */
function finishRound(s: GameState): { state: GameState; events: ReturnType<typeof apply>['events'] } {
  let state = s;
  const events: ReturnType<typeof apply>['events'] = [];
  const startRound = state.round;
  while (state.phase.kind === 'turn' && state.round === startRound) {
    const r = apply(actions(state), { type: 'END_TURN', by: active(state) });
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

// --- Debt -------------------------------------------------------------------

test('debt: 10% interest (rounded down) accrues on ordinary debt at the start of each round', () => {
  const s = patchPlayer(patchPlayer(started(2), 'a', { debt: 105 }), 'b', { debt: 5 });
  const r = finishRound(s);
  assert.equal(r.state.round, 2);
  assert.equal(player(r.state, 'a').debt, 115);
  assert.equal(player(r.state, 'b').debt, 5); // floor(0.5) = 0, no event
  const acc = eventsOf(r.events, 'INTEREST_ACCRUED');
  assert.equal(acc.length, 1);
  assert.deepEqual({ player: acc[0]!.player, amount: acc[0]!.amount, round: acc[0]!.round }, { player: 'a', amount: 10, round: 2 });
  // Sequence: ROUND_ENDED (round 1) → INTEREST_ACCRUED (round 2) → TURN_STARTED (round 2).
  const i = (t: string, round: number) => r.events.findIndex((e) => e.type === t && e.round === round);
  assert.ok(i('ROUND_ENDED', 1) < i('INTEREST_ACCRUED', 2));
  assert.ok(i('INTEREST_ACCRUED', 2) < i('TURN_STARTED', 2));
});

test('debt: no interest is charged after round 12; final Net Worth uses the debt as it stood during round 12', () => {
  let s = started(2);
  while (s.round < 12) s = finishRound(s).state;
  s = patchPlayer(s, 'a', { debt: 300 });
  const r = finishRound(s);
  assert.equal(r.state.phase.kind, 'ended');
  assert.equal(eventsOf(r.events, 'INTEREST_ACCRUED').length, 0);
  assert.equal(player(r.state, 'a').debt, 300);
  assert.equal(eventsOf(r.events, 'MATCH_ENDED')[0]!.ranking.find((x) => x.player === 'a')!.netWorth, computeNetWorth(r.state, 'a'));
  // Across a whole match a constant debt accrues exactly 11 times (start of rounds 2–12).
  let t = patchPlayer(started(2), 'b', { debt: 10 });
  let count = 0;
  while (t.phase.kind !== 'ended') {
    const x = finishRound(t);
    count += eventsOf(x.events, 'INTEREST_ACCRUED').filter((e) => e.player === 'b').length;
    t = x.state;
  }
  assert.equal(count, 11);
});

test('debt: the Credit Line is interest-free and does not accrue', () => {
  const s = patchPlayer(started(2), 'a', { creditLine: 200 });
  const r = finishRound(s);
  assert.equal(player(r.state, 'a').creditLine, 200);
  assert.equal(eventsOf(r.events, 'INTEREST_ACCRUED').length, 0);
});

test('debt: nobody is eliminated; a deeply indebted player keeps taking turns', () => {
  let s = patchPlayer(started(2), 'a', { debt: 5000, cash: 0 });
  for (let i = 0; i < 3; i++) s = finishRound(s).state;
  assert.equal(s.round, 4);
  assert.equal(s.players.length, 2);
  assert.ok(s.players.some((p) => p.id === 'a'));
});

// --- Leverage ---------------------------------------------------------------

test('leverage: at the start of rounds 2–12, after interest, every tied-last player (lowest Net Worth) receives one token', () => {
  // No grant in round 1: START_MATCH leaves everyone at 0.
  const s0 = started(3);
  assert.equal(eventsOf(s0.eventLog, 'LEVERAGE_TOKEN_GRANTED').length, 0);
  for (const p of s0.players) assert.equal(p.leverageTokens, 0);

  const s = patchPlayer(s0, 'a', { cash: 1100 });
  const r = finishRound(s);
  const granted = eventsOf(r.events, 'LEVERAGE_TOKEN_GRANTED');
  assert.deepEqual(granted.map((g) => ({ player: g.player, round: g.round })), [{ player: 'a', round: 2 }]);
  assert.equal(player(r.state, 'a').leverageTokens, 1);
  assert.equal(player(r.state, 'b').leverageTokens, 0);

  // Interest is applied first and changes who is last: b (₵1,190 cash) vs a (₵1,200 cash, ₵20 debt → ₵22 after interest).
  const order = patchPlayer(patchPlayer(started(3), 'a', { debt: 20 }), 'b', { cash: 1190 });
  const r2 = finishRound(order);
  const i = (t: string) => r2.events.findIndex((e) => e.type === t);
  assert.ok(i('INTEREST_ACCRUED') < i('LEVERAGE_TOKEN_GRANTED'));
  assert.deepEqual(eventsOf(r2.events, 'LEVERAGE_TOKEN_GRANTED').map((g) => g.player), ['a']);

  // Ties: everyone tied for lowest receives a token.
  const tie = finishRound(started(3));
  assert.deepEqual(eventsOf(tie.events, 'LEVERAGE_TOKEN_GRANTED').map((g) => g.player).sort(), ['a', 'b', 'c']);
});

test('leverage: tokens are capped at 3 and no grant happens after round 12', () => {
  const s = patchPlayer(started(2), 'a', { cash: 1000, leverageTokens: 3 });
  const r = finishRound(s);
  assert.equal(player(r.state, 'a').leverageTokens, 3);
  assert.equal(eventsOf(r.events, 'LEVERAGE_TOKEN_GRANTED').length, 0);

  let t = patchPlayer(started(2), 'a', { cash: 1000 });
  while (t.round < 12) t = finishRound(t).state;
  const before = player(t, 'a').leverageTokens;
  const end = finishRound(t);
  assert.equal(end.state.phase.kind, 'ended');
  assert.equal(eventsOf(end.events, 'LEVERAGE_TOKEN_GRANTED').length, 0);
  assert.equal(player(end.state, 'a').leverageTokens, before);
});

test('leverage: Force Auction targets an unowned property, consumes a token, and the user may bid', () => {
  const s0 = started(3);
  const id = active(s0);
  const other = s0.players.find((p) => p.id !== id)!.id;
  const s = actions(patchPlayer(own(s0, other, 6), id, { leverageTokens: 1 }));
  assert.equal(mustFail(applyCommand(s, { type: 'USE_LEVERAGE_TOKEN', by: id, payload: { kind: 'force_auction', tileIndex: 6 } })), 'INVALID_LEVERAGE_TARGET');
  assert.equal(mustFail(applyCommand(s, { type: 'USE_LEVERAGE_TOKEN', by: id, payload: { kind: 'force_auction', tileIndex: 8 } })), 'INVALID_LEVERAGE_TARGET');
  assert.equal(mustFail(applyCommand(patchPlayer(s, id, { leverageTokens: 0 }), { type: 'USE_LEVERAGE_TOKEN', by: id, payload: { kind: 'force_auction', tileIndex: 23 } })), 'NO_LEVERAGE_TOKENS');

  const r = apply(s, { type: 'USE_LEVERAGE_TOKEN', by: id, payload: { kind: 'force_auction', tileIndex: 23 } });
  assert.equal(player(r.state, id).leverageTokens, 0);
  const opened = eventsOf(r.events, 'AUCTION_OPENED')[0]!;
  assert.deepEqual({ tile: opened.tileIndex, origin: opened.origin, min: opened.minimumBid }, { tile: 23, origin: 'leverage', min: 130 });
  assert.ok(opened.eligible.includes(id));
  const done = apply(r.state, { type: 'SUBMIT_SEALED_BID', by: id, amount: 130 }, { type: 'CLOSE_AUCTION', by: 'host' });
  assert.equal(done.state.ownership[23], id);
  assert.equal(done.state.pricePaid[23], 130);
  // Back in the same action window; the turn can still end.
  assert.equal(done.state.phase.kind === 'turn' && done.state.phase.step.kind, 'actions');
  apply(done.state, { type: 'END_TURN', by: id });
});

test('leverage: Credit Line adds ₵200 cash as a separate interest-free balance; not income, so ordinary debt is untouched', () => {
  const s0 = started(2);
  const id = active(s0);
  const s = actions(patchPlayer(s0, id, { leverageTokens: 2 }));
  const r = apply(s, { type: 'USE_LEVERAGE_TOKEN', by: id, payload: { kind: 'credit_line' } });
  assert.equal(player(r.state, id).cash, 1400);
  assert.equal(player(r.state, id).creditLine, 200);
  assert.equal(player(r.state, id).leverageTokens, 1);
  assert.equal(computeNetWorth(r.state, id), 1200);
  assert.equal(eventsOf(r.events, 'CREDIT_LINE_TAKEN')[0]!.amount, 200);

  // With ordinary debt outstanding: full ₵200 to cash, debt unchanged, no DEBT_REPAID.
  const inDebt = actions(patchPlayer(s0, id, { leverageTokens: 1, debt: 500, cash: 0 }));
  const r2 = apply(inDebt, { type: 'USE_LEVERAGE_TOKEN', by: id, payload: { kind: 'credit_line' } });
  assert.equal(player(r2.state, id).cash, 200);
  assert.equal(player(r2.state, id).debt, 500);
  assert.equal(player(r2.state, id).creditLine, 200);
  assert.equal(eventsOf(r2.events, 'DEBT_REPAID').length, 0);
  assert.equal(computeNetWorth(r2.state, id), 200 - 500 - 200);

  // Ordinary incoming money still repays only ordinary debt, never the Credit Line.
  const later = moveBy(patchPlayer(r2.state, id, { debt: 0 }), 22, 3); // Hub bonus with no ordinary debt
  assert.equal(player(later.state, id).creditLine, 200);
  assert.equal(eventsOf(later.events, 'DEBT_REPAID').length, 0);
  assert.equal(player(later.state, id).cash, 350);
});

test('leverage: only two options exist; legalCommands never offers a third', () => {
  const s0 = started(2);
  const id = active(s0);
  const s = actions(patchPlayer(s0, id, { leverageTokens: 1 }));
  const kinds = new Set(
    legalCommands(s, id)
      .filter((c): c is Extract<Command, { type: 'USE_LEVERAGE_TOKEN' }> => c.type === 'USE_LEVERAGE_TOKEN')
      .map((c) => c.payload.kind),
  );
  assert.deepEqual([...kinds].sort(), ['credit_line', 'force_auction']);
});

// --- City Pulse -------------------------------------------------------------

test('pulse: announced at the start of rounds 3/6/9, applied at 4/7/10, persists until replaced', () => {
  let s = started(2);
  const log: string[] = [];
  while (s.phase.kind !== 'ended') {
    const r = finishRound(s);
    for (const e of r.events) {
      if (e.type === 'CITY_PULSE_TELEGRAPHED') log.push(`T${e.effect.round}@${r.state.round}`);
      if (e.type === 'CITY_PULSE_APPLIED') log.push(`A${e.effect.round}@${r.state.round}`);
    }
    if (r.state.phase.kind !== 'ended') {
      if (r.state.round === 5 || r.state.round === 6) assert.equal(r.state.cityPulse.active?.round, 4);
      if (r.state.round === 8) assert.equal(r.state.cityPulse.active?.round, 7);
      if (r.state.round === 12) assert.deepEqual(r.state.cityPulse.active, { round: 10, boosted: 'Transit', suppressed: 'Tech' });
    }
    s = r.state;
  }
  assert.deepEqual(log, ['T4@3', 'A4@4', 'T7@6', 'A7@7', 'T10@9', 'A10@10']);
  assert.equal(s.cityPulse.applied.length, 3);
  assert.deepEqual(s.cityPulse.applied[0], { round: 4, boosted: 'Tech', suppressed: 'Industry' });
  assert.deepEqual(s.cityPulse.applied[1], { round: 7, boosted: 'Leisure', suppressed: 'Energy' });
});

test('pulse relay: optional reroll of the next upcoming Pulse, even if already announced; deterministic; distinct categories', () => {
  // Round 3: Pulse 4 has been announced.
  let s = started(2);
  while (s.round < 3) s = finishRound(s).state;
  assert.equal(s.cityPulse.telegraphed.length, 1);
  const id = active(s);
  const landed = moveBy(s, 3, 1); // → 4 Pulse Relay
  assert.equal(landed.state.phase.kind === 'turn' && landed.state.phase.step.kind === 'actions' && landed.state.phase.step.pulseRelayAvailable, true);
  assert.ok(legalCommands(landed.state, id).some((c) => c.type === 'REROLL_PULSE'));

  const r1 = apply(landed.state, { type: 'REROLL_PULSE', by: id });
  const r2 = apply(landed.state, { type: 'REROLL_PULSE', by: id });
  const ev = eventsOf(r1.events, 'CITY_PULSE_REROLLED')[0]!;
  assert.equal(ev.wasTelegraphed, true);
  assert.equal(ev.effect.round, 4);
  assert.notEqual(ev.effect.boosted, ev.effect.suppressed);
  assert.deepEqual(ev.previous, { round: 4, boosted: 'Tech', suppressed: 'Industry' });
  assert.deepEqual(r1.state.cityPulse.schedule[0], ev.effect);
  assert.deepEqual(r1.state.cityPulse.telegraphed[0], ev.effect);
  assert.deepEqual(r1.state.cityPulse.schedule, r2.state.cityPulse.schedule);
  assert.deepEqual(r1.state.cityPulse.schedule.slice(1), landed.state.cityPulse.schedule.slice(1));
  // Once per landing.
  assert.equal(mustFail(applyCommand(r1.state, { type: 'REROLL_PULSE', by: id })), 'REROLL_NOT_AVAILABLE');
  // Optional: the player may simply end the turn.
  apply(landed.state, { type: 'END_TURN', by: id });
  // The rerolled Pulse is what gets applied.
  let t = r1.state;
  t = apply(t, { type: 'END_TURN', by: id }).state;
  t = finishRound(t).state;
  assert.equal(t.round, 4);
  assert.deepEqual(t.cityPulse.active, ev.effect);
});

test('pulse relay: never touches an active Pulse; no reroll available after the last Pulse', () => {
  let s = started(2);
  while (s.round < 4) s = finishRound(s).state;
  const activeBefore = s.cityPulse.active;
  const landed = moveBy(s, 11, 1); // → 12 Pulse Relay during round 4
  const r = apply(landed.state, { type: 'REROLL_PULSE', by: active(s) });
  assert.deepEqual(r.state.cityPulse.active, activeBefore);
  assert.equal(eventsOf(r.events, 'CITY_PULSE_REROLLED')[0]!.effect.round, 7);

  while (s.round < 10) s = finishRound(s).state;
  const late = moveBy(s, 11, 1);
  assert.equal(late.state.phase.kind === 'turn' && late.state.phase.step.kind === 'actions' && late.state.phase.step.pulseRelayAvailable, false);
  assert.equal(mustFail(applyCommand(late.state, { type: 'REROLL_PULSE', by: active(s) })), 'REROLL_NOT_AVAILABLE');
  assert.equal(mustFail(applyCommand(actions(started(2)), { type: 'REROLL_PULSE', by: active(started(2)) })), 'REROLL_NOT_AVAILABLE');
});

// --- Scoring / determinism --------------------------------------------------

test('net worth: cash + prices paid + upgrades paid − debt − credit line', () => {
  let s = started(2);
  s = own(s, 'a', 6, 300, 2, 260); // bought at auction for 300, two upgrades
  s = patchPlayer(s, 'a', { cash: 500, debt: 120, creditLine: 200 });
  assert.equal(computeNetWorth(s, 'a'), 500 + 300 + 260 - 120 - 200);
  assert.equal(computeNetWorth(s, 'b'), 1200);
});

test('match end: no early end; exactly 12 rounds and 12 turns per player; ranking by Net Worth; ties keep seat order', () => {
  let s = patchPlayer(patchPlayer(started(3), 'a', { cash: 1300 }), 'b', { debt: 100 });
  let ended: ReturnType<typeof finishRound> | null = null;
  let rounds = 0;
  while (s.phase.kind !== 'ended') {
    ended = finishRound(s);
    s = ended.state;
    rounds++;
  }
  assert.equal(rounds, 12);
  assert.equal(s.round, 12);
  assert.equal(eventsOf(s.eventLog, 'ROUND_ENDED').length, 12);
  for (const p of s.players) assert.equal(eventsOf(s.eventLog, 'TURN_STARTED').filter((e) => e.player === p.id).length, 12);
  const end = eventsOf(ended!.events, 'MATCH_ENDED')[0]!;
  assert.equal(end.ranking[0]!.player, 'a');
  assert.equal(end.ranking[2]!.player, 'b');
  assert.equal(end.ranking[2]!.netWorth, computeNetWorth(s, 'b'));
  // The final round's close carries no interest and no Leverage grant.
  assert.equal(eventsOf(ended!.events, 'INTEREST_ACCRUED').length, 0);
  assert.equal(eventsOf(ended!.events, 'LEVERAGE_TOKEN_GRANTED').length, 0);

  let t = started(3);
  let lastEvents: ReturnType<typeof finishRound>['events'] = [];
  while (t.phase.kind !== 'ended') {
    const r = finishRound(t);
    t = r.state;
    lastEvents = r.events;
  }
  assert.deepEqual(eventsOf(lastEvents, 'MATCH_ENDED')[0]!.ranking.map((r) => r.player), t.players.map((p) => p.id));
});

test('determinism: replaying the same commands from the same seed yields identical hashes; inputs are never mutated', () => {
  const script = (seed: number) => {
    let s = started(4, seed);
    const hashes: string[] = [];
    let guard = 0;
    while (s.phase.kind !== 'ended' && guard++ < 5000) {
      const who = whoseDecision(s)!;
      const cmds = legalCommands(s, who);
      const before = JSON.stringify(s);
      // Deterministic policy: rotate through legal commands by event count.
      const cmd = cmds[s.nextSeq % cmds.length]!;
      const r = must(applyCommand(s, cmd));
      assert.equal(JSON.stringify(s), before, 'applyCommand mutated its input');
      s = r.state;
      hashes.push(hashState(s));
    }
    return { hashes, final: s };
  };
  const a = script(2024);
  const b = script(2024);
  assert.deepEqual(a.hashes, b.hashes);
  assert.equal(a.final.phase.kind, 'ended');
  assert.notDeepEqual(script(2025).hashes, a.hashes);
  // Plain data: survives a JSON round trip unchanged.
  assert.deepEqual(JSON.parse(JSON.stringify(a.final)), a.final);
});

test('determinism: a timed-out turn is reproducible and a full match of timeouts still completes 12 rounds', () => {
  let s = started(3, 7);
  let guard = 0;
  while (s.phase.kind !== 'ended' && guard++ < 5000) {
    const cmd: Command = s.phase.kind === 'auction' ? { type: 'CLOSE_AUCTION', by: 'host' } : { type: 'TURN_TIMED_OUT', by: 'host' };
    s = must(applyCommand(s, cmd)).state;
  }
  assert.equal(s.phase.kind, 'ended');
  assert.equal(eventsOf(s.eventLog, 'ROUND_ENDED').length, 12);
  assert.equal(eventsOf(s.eventLog, 'CITY_PULSE_APPLIED').length, 3);
  assert.equal(eventsOf(s.eventLog, 'TURN_STARTED').length, 36);
  for (const p of s.players) assert.equal(p.cash >= 0 && p.debt >= 0, true);
});

test('purity: withDice/ADVANCE from an identical state twice gives identical results', () => {
  const s = withDice(started(2, 3), [4, 4]);
  const id = active(s);
  const r1 = must(applyCommand(s, { type: 'ADVANCE', by: id }));
  const r2 = must(applyCommand(s, { type: 'ADVANCE', by: id }));
  assert.equal(hashState(r1.state), hashState(r2.state));
  assert.deepEqual(r1.events, r2.events);
});
