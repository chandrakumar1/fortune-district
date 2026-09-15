/**
 * Player identity (Stage B plan §2): session-scoped seat ids p1…p4 and secure
 * per-match rejoin tokens. Tokens are random (node:crypto), stored only as a
 * SHA-256 digest, compared in constant time, and never logged or serialised.
 * No accounts, no persistence. Nothing here touches GameState.
 */

import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

import { MAX_PLAYERS } from './engine.ts';
import type { PlayerId } from './engine.ts';

export interface Seat {
  readonly playerId: PlayerId;
  readonly displayName: string;
  /** Transport-level session id of the currently bound client, or null when disconnected. */
  clientId: string | null;
}

/** Opaque token handed to exactly one client, once, at join. */
export type RejoinToken = string;

function digest(token: RejoinToken): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

export class SeatRegistry {
  readonly #seats = new Map<PlayerId, Seat>();
  readonly #tokenDigests = new Map<PlayerId, Buffer>();
  readonly #byClient = new Map<string, PlayerId>();

  /** Seats in join order (p1, p2, …). */
  get seats(): readonly Seat[] {
    return [...this.#seats.values()];
  }

  get size(): number {
    return this.#seats.size;
  }

  playerOf(clientId: string): PlayerId | null {
    return this.#byClient.get(clientId) ?? null;
  }

  seat(playerId: PlayerId): Seat | null {
    return this.#seats.get(playerId) ?? null;
  }

  /**
   * Allocate the lowest free seat id and a fresh rejoin token. Returns null
   * when the room is full. The token is returned exactly once; only its digest
   * is retained.
   */
  allocate(clientId: string, displayName: string): { readonly seat: Seat; readonly token: RejoinToken } | null {
    if (this.#seats.size >= MAX_PLAYERS) return null;
    let playerId: PlayerId | null = null;
    for (let i = 1; i <= MAX_PLAYERS; i++) {
      const candidate = `p${i}`;
      if (!this.#seats.has(candidate)) {
        playerId = candidate;
        break;
      }
    }
    if (playerId === null) return null;
    const token = randomBytes(32).toString('base64url');
    const seat: Seat = { playerId, displayName, clientId };
    this.#seats.set(playerId, seat);
    this.#tokenDigests.set(playerId, digest(token));
    this.#byClient.set(clientId, playerId);
    return { seat, token };
  }

  /** Lobby only: the seat is freed entirely (no reservation before the match starts). */
  release(playerId: PlayerId): void {
    const seat = this.#seats.get(playerId);
    if (!seat) return;
    if (seat.clientId !== null) this.#byClient.delete(seat.clientId);
    this.#seats.delete(playerId);
    this.#tokenDigests.delete(playerId);
  }

  /** The client went away; the seat stays reserved, its token stays valid. */
  unbind(clientId: string): PlayerId | null {
    const playerId = this.#byClient.get(clientId);
    if (playerId === undefined) return null;
    this.#byClient.delete(clientId);
    const seat = this.#seats.get(playerId);
    if (seat) seat.clientId = null;
    return playerId;
  }

  /**
   * Rejoin: bind a new client to the seat whose token digest matches, in
   * constant time. A token only ever matches its own seat; a seat that is
   * still bound to a live client refuses (the old client must leave first).
   */
  rejoin(clientId: string, token: RejoinToken): Seat | null {
    const probe = digest(token);
    for (const [playerId, stored] of this.#tokenDigests) {
      if (stored.length !== probe.length || !timingSafeEqual(stored, probe)) continue;
      const seat = this.#seats.get(playerId);
      if (!seat || seat.clientId !== null) return null;
      seat.clientId = clientId;
      this.#byClient.set(clientId, playerId);
      return seat;
    }
    return null;
  }

  /** Match over: tokens are useless from here on. */
  revokeAll(): void {
    this.#tokenDigests.clear();
  }
}

/** Match seed for production (D5): drawn once at START from node:crypto (the global RNG is never used). */
export function newSeed(): number {
  return randomInt(0, 2 ** 31);
}
