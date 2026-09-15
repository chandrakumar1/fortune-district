/**
 * MatchSession — the server-side HOST for one match (Stage B plan §1–§7).
 *
 * It owns the authoritative GameState and is the only thing that changes it,
 * and it does so in exactly one way: `state = applyCommand(state, cmd).state`.
 * Everything else it owns — lobby roster, ready flags, creator, presence,
 * deadline, timer epoch, NO_BID declarations, the accepted command log — is
 * session metadata and lives OUTSIDE GameState (decisions 2, 7, 13).
 *
 * No Colyseus import: the room adapter (Stage D) feeds it client ids and raw
 * messages and delivers what the `sink` emits. Time comes only from the
 * injected Clock; expiry re-enters the engine as ordinary host commands.
 */

import {
  AUCTION_BID_WINDOW_SECONDS,
  MIN_PLAYERS,
  TURN_TIMER_SECONDS,
  applyCommand as engineApplyCommand,
  createInitialState,
  hashState,
  legalCommands,
  whoseDecision,
} from './engine.ts';
import type { ApplyResult, Command, GameEvent, GameState, MatchId, PlayerId } from './engine.ts';
import type { Clock, TimerHandle } from './clock.ts';
import { buildEnvelope } from './envelope.ts';
import { parseClientCommand, parseClientMessage, stampCommand } from './messages.ts';
import type { Deadline, Presence, RejectedMessage, RoomPhase, ServerMessage } from './messages.ts';
import type { ReplayRecord } from './replay.ts';
import { SeatRegistry, newSeed } from './session.ts';
import type { RejoinToken, Seat } from './session.ts';

export type Sink = (to: PlayerId, message: ServerMessage) => void;

export interface MatchSessionOptions {
  readonly matchId: MatchId;
  readonly clock: Clock;
  readonly sink: Sink;
  /** Fixed seed (tests / non-production). Production leaves it undefined → crypto seed at START. */
  readonly seed?: number;
  /** Official values from the engine constants; overridable only by tests. */
  readonly turnMs?: number;
  readonly auctionMs?: number;
  /** The reducer; tests inject a counting wrapper to prove every state change passes through it. */
  readonly applyCommand?: (state: GameState, command: Command) => ApplyResult;
}

export type JoinResult = { readonly ok: true; readonly playerId: PlayerId; readonly token: RejoinToken } | { readonly ok: false; readonly reason: 'FULL' | 'NOT_IN_LOBBY' };

export class MatchSession {
  readonly matchId: MatchId;
  readonly #clock: Clock;
  readonly #sink: Sink;
  readonly #apply: (state: GameState, command: Command) => ApplyResult;
  readonly #turnMs: number;
  readonly #auctionMs: number;
  readonly #fixedSeed: number | undefined;

  // ---- authoritative (engine-owned) ----
  #state: GameState | null = null;
  #seed: number | null = null;
  readonly #commandLog: Command[] = [];

  // ---- session metadata (outside GameState) ----
  readonly #seats = new SeatRegistry();
  readonly #ready = new Set<PlayerId>();
  #creator: PlayerId | null = null;
  #roomPhase: RoomPhase = 'lobby';
  readonly #noBid = new Set<PlayerId>();
  #deadline: Deadline | null = null;
  #timer: TimerHandle | null = null;
  #epoch = 0;
  #disposed = false;

  constructor(opts: MatchSessionOptions) {
    this.matchId = opts.matchId;
    this.#clock = opts.clock;
    this.#sink = opts.sink;
    this.#apply = opts.applyCommand ?? engineApplyCommand;
    this.#turnMs = opts.turnMs ?? TURN_TIMER_SECONDS * 1000;
    this.#auctionMs = opts.auctionMs ?? AUCTION_BID_WINDOW_SECONDS * 1000;
    this.#fixedSeed = opts.seed;
  }

  // ---------------------------------------------------------------------------
  // Read-only introspection (tests, adapter)
  // ---------------------------------------------------------------------------

  get roomPhase(): RoomPhase {
    return this.#roomPhase;
  }

  get creator(): PlayerId | null {
    return this.#creator;
  }

  get deadline(): Deadline | null {
    return this.#deadline;
  }

  get epoch(): number {
    return this.#epoch;
  }

  get commandCount(): number {
    return this.#commandLog.length;
  }

  get seats(): readonly Seat[] {
    return this.#seats.seats;
  }

  /** Fingerprint of the authoritative state; null before START. */
  stateHash(): string | null {
    return this.#state ? hashState(this.#state) : null;
  }

  /** Events so far (authoritative log; tests compare it with the replay). */
  eventLog(): readonly GameEvent[] {
    return this.#state ? this.#state.eventLog : [];
  }

  playerOf(clientId: string): PlayerId | null {
    return this.#seats.playerOf(clientId);
  }

  presence(): Presence {
    const players: Record<PlayerId, { displayName: string; connected: boolean; ready: boolean }> = {};
    for (const s of this.#seats.seats) players[s.playerId] = { displayName: s.displayName, connected: s.clientId !== null, ready: this.#ready.has(s.playerId) };
    return { phase: this.#roomPhase, creator: this.#creator, players };
  }

  /** Replay record: seed + players + accepted engine commands only (no tokens, presence, timings, session messages). */
  record(): ReplayRecord | null {
    if (!this.#state || this.#seed === null) return null;
    return { matchId: this.matchId, seed: this.#seed, players: this.#state.config.players, commands: [...this.#commandLog] };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle: join / leave / rejoin
  // ---------------------------------------------------------------------------

  /** Lobby only. Returns the rejoin token exactly once; the adapter sends it in WELCOME. */
  join(clientId: string, displayName: string): JoinResult {
    if (this.#roomPhase !== 'lobby') return { ok: false, reason: 'NOT_IN_LOBBY' };
    const allocated = this.#seats.allocate(clientId, displayName.trim() || 'Player');
    if (!allocated) return { ok: false, reason: 'FULL' };
    if (this.#creator === null) this.#creator = allocated.seat.playerId;
    this.#broadcast();
    return { ok: true, playerId: allocated.seat.playerId, token: allocated.token };
  }

  /** Rejoin with a token: rebinds the seat and resends that player's current envelope. */
  rejoin(clientId: string, token: RejoinToken): PlayerId | null {
    if (this.#roomPhase === 'finished') return null;
    const seat = this.#seats.rejoin(clientId, token);
    if (!seat) return null;
    this.#broadcast(); // presence changed for everyone; the rejoiner gets their view + live deadline
    return seat.playerId;
  }

  /**
   * A client went away. In the lobby the seat is freed (D4); during play the
   * seat stays reserved and the timers keep running (decision 3).
   */
  leave(clientId: string): void {
    const playerId = this.#seats.unbind(clientId);
    if (playerId === null) return;
    if (this.#roomPhase === 'lobby') {
      this.#seats.release(playerId);
      this.#ready.delete(playerId);
      if (this.#creator === playerId) this.#creator = this.#seats.seats[0]?.playerId ?? null;
    }
    this.#broadcast();
  }

  /** Room disposal: stop the timer; nothing else to release. */
  dispose(): void {
    this.#disposed = true;
    this.#clearTimer();
  }

  // ---------------------------------------------------------------------------
  // Messages from clients
  // ---------------------------------------------------------------------------

  handle(clientId: string, raw: unknown): void {
    const playerId = this.#seats.playerOf(clientId);
    const msg = parseClientMessage(raw);
    if (!msg) {
      if (playerId) this.#reject(playerId, '?', 'MALFORMED', 'Unrecognised message.');
      return;
    }
    if (!playerId) return; // unseated clients are ignored (the adapter should not let this happen)

    switch (msg.type) {
      case 'READY':
        if (this.#roomPhase !== 'lobby') return this.#reject(playerId, 'READY', 'WRONG_ROOM_PHASE', 'The match has already started.');
        if (msg.ready) this.#ready.add(playerId);
        else this.#ready.delete(playerId);
        return this.#broadcast();

      case 'START':
        return this.#start(playerId);

      case 'COMMAND': {
        if (this.#roomPhase !== 'playing') return this.#reject(playerId, 'COMMAND', 'WRONG_ROOM_PHASE', 'No match in progress.');
        const parsed = parseClientCommand(msg.command);
        if (!parsed) {
          const t = typeof msg.command === 'object' && msg.command !== null ? String((msg.command as { type?: unknown }).type ?? '?') : '?';
          const hostOnly = t === 'START_MATCH' || t === 'TURN_TIMED_OUT' || t === 'CLOSE_AUCTION';
          return this.#reject(playerId, t, hostOnly ? 'HOST_ONLY' : 'MALFORMED', hostOnly ? 'That command is issued by the server only.' : 'Malformed command.');
        }
        this.submit(stampCommand(parsed, playerId));
        return;
      }

      case 'NO_BID': {
        // Session metadata only (D2): lets the auction close before the window ends. Never an engine command.
        const s = this.#state;
        if (!s || s.phase.kind !== 'auction' || !s.auction || !s.auction.eligible.includes(playerId)) return;
        this.#noBid.add(playerId);
        this.#afterChange([]);
        return;
      }

      case 'GET_REPLAY': {
        const record = this.record();
        if (record) this.#sink(playerId, { type: 'REPLAY', record });
        return;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // The one door into the engine
  // ---------------------------------------------------------------------------

  /**
   * Apply a fully-stamped command. Accepted → new state, log entry, timers,
   * envelopes. Refused → REJECTED to `command.by` (if a player) and nothing
   * else changes: not the state, log, deadline or epoch (requirement 13).
   */
  submit(command: Command): boolean {
    if (!this.#state || this.#disposed) return false;
    const result = this.#apply(this.#state, command);
    if (!result.ok) {
      if (command.by !== 'host') this.#reject(command.by, command.type, result.error.code, result.error.message);
      return false;
    }
    this.#state = result.state;
    this.#commandLog.push(command);
    this.#afterChange(result.events);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  #start(playerId: PlayerId): void {
    if (this.#roomPhase !== 'lobby') return this.#reject(playerId, 'START', 'WRONG_ROOM_PHASE', 'The match has already started.');
    if (playerId !== this.#creator) return this.#reject(playerId, 'START', 'NOT_CREATOR', 'Only the room creator can start the match.');
    const seats = this.#seats.seats;
    if (seats.length < MIN_PLAYERS) return this.#reject(playerId, 'START', 'NOT_READY', `Need at least ${MIN_PLAYERS} players.`);
    const notReady = seats.filter((s) => !this.#ready.has(s.playerId));
    if (notReady.length) return this.#reject(playerId, 'START', 'NOT_READY', `Waiting for: ${notReady.map((s) => s.displayName).join(', ')}.`);

    this.#seed = this.#fixedSeed ?? newSeed();
    this.#state = createInitialState({ matchId: this.matchId, seed: this.#seed, players: seats.map((s) => ({ id: s.playerId, displayName: s.displayName })) });
    this.#roomPhase = 'playing';
    // START_MATCH is command #1 of the replay record; the engine performs the seeded seat shuffle.
    if (!this.submit({ type: 'START_MATCH', by: 'host' })) {
      // Cannot happen with a valid lobby; keep the invariant "playing ⇒ started" honest.
      this.#state = null;
      this.#seed = null;
      this.#roomPhase = 'lobby';
      this.#reject(playerId, 'START', 'WRONG_ROOM_PHASE', 'The engine refused to start the match.');
    }
  }

  /** Who the session is waiting for: whoseDecision, minus bidders who declared NO_BID. */
  #pendingActor(): PlayerId | 'host' | null {
    const s = this.#state;
    if (!s) return null;
    if (s.phase.kind === 'auction' && s.auction) {
      const next = s.auction.eligible.find((id) => !this.#noBid.has(id) && legalCommands(s, id).some((c) => c.type === 'SUBMIT_SEALED_BID'));
      return next ?? 'host';
    }
    return whoseDecision(s);
  }

  #afterChange(events: readonly GameEvent[]): void {
    const s = this.#state;
    if (!s) return;
    const opened = events.some((e) => e.type === 'AUCTION_OPENED');
    if (opened || events.some((e) => e.type === 'AUCTION_RESOLVED')) this.#noBid.clear();

    if (s.phase.kind === 'ended') {
      this.#clearTimer();
      this.#deadline = null;
      this.#roomPhase = 'finished';
      this.#seats.revokeAll();
      this.#broadcast();
      return;
    }

    const actor = this.#pendingActor();
    if (s.phase.kind === 'auction' && actor === 'host') {
      // Everyone eligible has bid, declared NO_BID, or cannot afford the minimum: close now (host command → replay log).
      this.submit({ type: 'CLOSE_AUCTION', by: 'host' });
      return;
    }

    if (s.phase.kind === 'auction') {
      // One shared window per auction, armed when it opens; bids do not extend it.
      if (opened || this.#deadline === null || this.#deadline.kind !== 'auction') this.#arm('auction', null, this.#auctionMs);
    } else if (s.phase.kind === 'turn') {
      const key = `${s.nextSeq}:${s.phase.activePlayer}`;
      if (this.#armedKey !== key) this.#arm('turn', s.phase.activePlayer, this.#turnMs, key);
    }
    this.#broadcast();
  }

  #armedKey: string | null = null;

  #arm(kind: 'turn' | 'auction', actor: PlayerId | null, ms: number, key: string | null = null): void {
    this.#clearTimer();
    const epoch = ++this.#epoch;
    this.#armedKey = key;
    const now = this.#clock.now();
    this.#deadline = { kind, actor, endsAt: now + ms, totalMs: ms, serverNow: now };
    this.#timer = this.#clock.setTimeout(() => {
      this.#timer = null;
      if (epoch !== this.#epoch || this.#disposed) return; // stale: the decision already happened
      this.#expire(kind);
    }, ms);
  }

  #expire(kind: 'turn' | 'auction'): void {
    const s = this.#state;
    if (!s) return;
    if (kind === 'auction' && s.phase.kind === 'auction') {
      this.submit({ type: 'CLOSE_AUCTION', by: 'host' }); // absent bids are simply no bids
    } else if (kind === 'turn' && s.phase.kind === 'turn') {
      this.submit({ type: 'TURN_TIMED_OUT', by: 'host' }); // the engine applies the step's default (R11)
    }
  }

  #clearTimer(): void {
    if (this.#timer !== null) {
      this.#clock.clearTimeout(this.#timer);
      this.#timer = null;
    }
    this.#armedKey = null;
  }

  /** One envelope per CONNECTED seat, each with its own projection. */
  #broadcast(): void {
    const presence = this.presence();
    for (const seat of this.#seats.seats) {
      if (seat.clientId === null) continue;
      this.#sink(seat.playerId, { type: 'VIEW', envelope: buildEnvelope(this.#state, seat.playerId, presence, this.#deadline) });
    }
  }

  #reject(to: PlayerId, commandType: string, code: RejectedMessage['code'], message: string): void {
    this.#sink(to, { type: 'REJECTED', commandType, code, message });
  }
}
