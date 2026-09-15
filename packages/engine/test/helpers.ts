/**
 * Test helpers. State is plain data, so scenarios are built by patching a
 * started state rather than by scripting dozens of commands.
 */

import { applyCommand, createInitialState } from '../src/engine.ts';
import type { Command, GameEvent, GameState, PlayerId, PlayerState, TileIndex, TurnStep } from '../src/types.ts';

export const P = ['a', 'b', 'c', 'd'] as const;

export function lobby(n = 3, seed = 42): GameState {
  return createInitialState({
    matchId: 'test',
    seed,
    players: P.slice(0, n).map((id) => ({ id, displayName: id.toUpperCase() })),
  });
}

export function started(n = 3, seed = 42): GameState {
  return must(applyCommand(lobby(n, seed), { type: 'START_MATCH', by: 'host' })).state;
}

export function must(result: ReturnType<typeof applyCommand>): { state: GameState; events: readonly GameEvent[] } {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}: ${result.error.message}`);
  return result;
}

export function mustFail(result: ReturnType<typeof applyCommand>): string {
  if (result.ok) throw new Error('expected a RuleViolation, got ok');
  return result.error.code;
}

export function apply(state: GameState, ...commands: Command[]): { state: GameState; events: GameEvent[] } {
  let s = state;
  const events: GameEvent[] = [];
  for (const c of commands) {
    const r = must(applyCommand(s, c));
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

export function player(state: GameState, id: PlayerId): PlayerState {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new Error(`no player ${id}`);
  return p;
}

export function active(state: GameState): PlayerId {
  if (state.phase.kind !== 'turn') throw new Error(`not a turn phase: ${state.phase.kind}`);
  return state.phase.activePlayer;
}

export function patchPlayer(state: GameState, id: PlayerId, patch: Partial<PlayerState>): GameState {
  return { ...state, players: state.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}

/** Put the active player into a specific turn step (e.g. fixed dice). */
export function setStep(state: GameState, step: TurnStep): GameState {
  return { ...state, phase: { kind: 'turn', activePlayer: active(state), step } };
}

export function withDice(state: GameState, dice: readonly [number, number]): GameState {
  return setStep(state, { kind: 'roll', dice });
}

export function actions(state: GameState, over: Partial<Extract<TurnStep, { kind: 'actions' }>> = {}): GameState {
  return setStep(state, { kind: 'actions', upgradesThisTurn: 0, exchangeDiscount: false, pulseRelayAvailable: false, ...over });
}

export function own(state: GameState, id: PlayerId, tileIndex: TileIndex, pricePaid?: number, level = 0, upgradeSpend = 0): GameState {
  const tile = state.board[tileIndex];
  if (!tile || tile.kind !== 'property') throw new Error('not a property');
  return {
    ...state,
    ownership: { ...state.ownership, [tileIndex]: id },
    pricePaid: { ...state.pricePaid, [tileIndex]: pricePaid ?? tile.price },
    upgrades: { ...state.upgrades, [tileIndex]: level },
    upgradeSpend: { ...state.upgradeSpend, [tileIndex]: upgradeSpend },
  };
}

export function eventsOf<T extends GameEvent['type']>(events: readonly GameEvent[], type: T): Extract<GameEvent, { type: T }>[] {
  return events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
}

/**
 * Land the active player on tile (from + steps) by fixing two dice whose sum is
 * `steps`. Two dice sum to at least 2, so for steps < 2 the start tile is moved
 * back and the sum raised to 2 — the destination is unchanged.
 */
export function moveBy(state: GameState, from: TileIndex, steps: number): { state: GameState; events: GameEvent[] } {
  const id = active(state);
  let start = from;
  let total = steps;
  if (total < 2) {
    start = (from - (2 - total) + 24) % 24;
    total = 2;
  }
  if (total > 12) throw new Error('two dice sum to at most 12');
  const a = Math.min(6, total - 1);
  const dice: readonly [number, number] = [a, total - a];
  const s = withDice(patchPlayer(state, id, { position: start }), dice);
  return apply(s, { type: 'ADVANCE', by: id });
}
