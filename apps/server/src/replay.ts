/**
 * Replay record (Stage B plan §7): seed + players + every ACCEPTED engine
 * command, including host-generated START_MATCH / TURN_TIMED_OUT /
 * CLOSE_AUCTION. Nothing else — no presence, timings, tokens or session
 * messages — because nothing else affects GameState. Engine-only.
 */

import { applyCommand, createInitialState, hashState } from './engine.ts';
import type { Command, GameEvent, MatchConfig, MatchId, PlayerId } from './engine.ts';

export interface ReplayRecord {
  readonly matchId: MatchId;
  readonly seed: number;
  readonly players: readonly { readonly id: PlayerId; readonly displayName: string }[];
  readonly commands: readonly Command[];
}

export interface ReplayResult {
  readonly finalHash: string;
  readonly eventLog: readonly GameEvent[];
  readonly commandsApplied: number;
}

/** Fold the record through the engine. Throws on the first refused command (a record must never contain one). */
export function replayRecord(record: ReplayRecord): ReplayResult {
  const config: MatchConfig = { matchId: record.matchId, seed: record.seed, players: record.players };
  let state = createInitialState(config);
  let n = 0;
  for (const command of record.commands) {
    const result = applyCommand(state, command);
    if (!result.ok) throw new Error(`replay: command #${n} (${command.type}) refused: ${result.error.code} ${result.error.message}`);
    state = result.state;
    n++;
  }
  return { finalHash: hashState(state), eventLog: state.eventLog, commandsApplied: n };
}
