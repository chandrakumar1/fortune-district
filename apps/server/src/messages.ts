/**
 * Wire message shapes (Stage B plan §5, §9) and STRUCTURAL validation only:
 * is this one of the eleven v1 command types with primitive fields of the
 * right kind? Rule legality is the engine's job (applyCommand); `by` is never
 * taken from the client — the session stamps it.
 */

import type { Command, PlayerId, PlayerView, RuleViolationCode } from './engine.ts';

// ---------------------------------------------------------------------------
// Client → server
// ---------------------------------------------------------------------------

export type ClientMessage =
  | { readonly type: 'READY'; readonly ready: boolean }
  | { readonly type: 'START' }
  | { readonly type: 'COMMAND'; readonly command: unknown }
  | { readonly type: 'NO_BID' }
  | { readonly type: 'GET_REPLAY' };

/** Command shapes a client may send (without `by`). Host-only types are not listed and are rejected. */
export type ClientCommand =
  | { readonly type: 'ADVANCE' }
  | { readonly type: 'BUY_PROPERTY'; readonly tileIndex: number }
  | { readonly type: 'DECLINE_PROPERTY'; readonly tileIndex: number }
  | { readonly type: 'UPGRADE_PROPERTY'; readonly tileIndex: number }
  | { readonly type: 'USE_LEVERAGE_TOKEN'; readonly payload: { readonly kind: 'force_auction'; readonly tileIndex: number } | { readonly kind: 'credit_line' } }
  | { readonly type: 'REROLL_PULSE' }
  | { readonly type: 'END_TURN' }
  | { readonly type: 'SUBMIT_SEALED_BID'; readonly amount: number };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/**
 * Structural check of a client-supplied command. Returns the typed shape or
 * null. Deliberately ignores any `by` the client included.
 */
export function parseClientCommand(raw: unknown): ClientCommand | null {
  if (!isObj(raw) || typeof raw['type'] !== 'string') return null;
  switch (raw['type']) {
    case 'ADVANCE':
    case 'REROLL_PULSE':
    case 'END_TURN':
      return { type: raw['type'] };
    case 'BUY_PROPERTY':
    case 'DECLINE_PROPERTY':
    case 'UPGRADE_PROPERTY':
      return isInt(raw['tileIndex']) ? { type: raw['type'], tileIndex: raw['tileIndex'] } : null;
    case 'SUBMIT_SEALED_BID':
      return isInt(raw['amount']) ? { type: 'SUBMIT_SEALED_BID', amount: raw['amount'] } : null;
    case 'USE_LEVERAGE_TOKEN': {
      const p = raw['payload'];
      if (!isObj(p)) return null;
      if (p['kind'] === 'credit_line') return { type: 'USE_LEVERAGE_TOKEN', payload: { kind: 'credit_line' } };
      if (p['kind'] === 'force_auction' && isInt(p['tileIndex'])) return { type: 'USE_LEVERAGE_TOKEN', payload: { kind: 'force_auction', tileIndex: p['tileIndex'] } };
      return null;
    }
    default:
      return null; // START_MATCH, TURN_TIMED_OUT, CLOSE_AUCTION and unknown types never come from clients
  }
}

/** Stamp the sender: the only way a client command acquires `by`. */
export function stampCommand(c: ClientCommand, by: PlayerId): Command {
  return { ...c, by } as Command;
}

export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (!isObj(raw) || typeof raw['type'] !== 'string') return null;
  switch (raw['type']) {
    case 'READY':
      return typeof raw['ready'] === 'boolean' ? { type: 'READY', ready: raw['ready'] } : null;
    case 'START':
    case 'NO_BID':
    case 'GET_REPLAY':
      return { type: raw['type'] };
    case 'COMMAND':
      return 'command' in raw ? { type: 'COMMAND', command: raw['command'] } : null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Server → client
// ---------------------------------------------------------------------------

export type RoomPhase = 'lobby' | 'playing' | 'finished';

export interface PresencePlayer {
  readonly displayName: string;
  readonly connected: boolean;
  readonly ready: boolean;
}

/** Public, identical for every client (D3). */
export interface Presence {
  readonly phase: RoomPhase;
  readonly creator: PlayerId | null;
  readonly players: Readonly<Record<PlayerId, PresencePlayer>>;
}

/**
 * Public, identical for every client (D3). `endsAt`/`serverNow` are clock
 * milliseconds. `actor` is the player whose decision the turn timer waits
 * for; null during a sealed-auction window, which belongs to every eligible bidder.
 */
export interface Deadline {
  readonly kind: 'turn' | 'auction';
  readonly actor: PlayerId | null;
  readonly endsAt: number;
  readonly totalMs: number;
  readonly serverNow: number;
}

/** The frozen server → client shape (decision 8 / D3). Built per recipient. */
export interface Envelope {
  readonly playerView: PlayerView | null;
  readonly presence: Presence;
  readonly deadline: Deadline | null;
}

export interface ViewMessage {
  readonly type: 'VIEW';
  readonly envelope: Envelope;
}

export interface ReplayMessage {
  readonly type: 'REPLAY';
  readonly record: unknown; // ReplayRecord; typed loosely here to keep messages.ts free of replay.ts
}

/** Sent once, only to the joining client. Carries the rejoin token. */
export interface WelcomeMessage {
  readonly type: 'WELCOME';
  readonly playerId: PlayerId;
  readonly rejoinToken: string;
}

/** Sent to the sender of a refused command only. */
export interface RejectedMessage {
  readonly type: 'REJECTED';
  readonly commandType: string;
  readonly code: RuleViolationCode | 'MALFORMED' | 'NOT_SEATED' | 'HOST_ONLY' | 'WRONG_ROOM_PHASE' | 'NOT_CREATOR' | 'NOT_READY';
  readonly message: string;
}

/** Everything MatchSession can hand to the transport for one recipient. WELCOME is sent by the adapter, never through the sink. */
export type ServerMessage = ViewMessage | RejectedMessage | ReplayMessage;
