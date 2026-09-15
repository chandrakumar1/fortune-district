/**
 * Hot-seat host (ADR-0004): owns the single authoritative GameState, the
 * command log, the timers and the keyboard hand-off. It contains no rules —
 * every legality question is answered by the engine (`legalCommands`,
 * `whoseDecision`, `applyCommand`) and every hidden-information question by
 * `projectForPlayer`.
 */

import {
  AUCTION_BID_WINDOW_SECONDS,
  PLAYTEST_TURN_TIMER_SECONDS,
  applyCommand,
  computeNetWorth,
  createInitialState,
  hashState,
  legalCommands,
  projectForPlayer,
  whoseDecision,
} from './engine.ts';
import type { Actor, Command, GameEvent, GameState, PlayerId, PlayerView, RuleViolationCode } from './engine.ts';

export interface HostConfig {
  /** Seconds per decision for turn steps; null = no timer. */
  readonly decisionSeconds: number | null;
  /** Seconds per private bid screen; null = no timer. */
  readonly auctionSeconds: number | null;
}

export const DEFAULT_CONFIG: HostConfig = {
  decisionSeconds: PLAYTEST_TURN_TIMER_SECONDS,
  auctionSeconds: AUCTION_BID_WINDOW_SECONDS,
};

export interface TimerInfo {
  readonly remainingMs: number;
  readonly totalMs: number;
}

/** Everything the renderer needs. Built fresh on every change. */
export interface Snapshot {
  readonly phase: 'setup' | 'playing' | 'ended';
  readonly config: HostConfig;
  readonly seed: number | null;
  /** Player currently holding the keyboard (confirmed via Ready). */
  readonly keyboard: PlayerId | null;
  /** Who the engine (or the host's bid sequencing) says must act now. */
  readonly actor: Actor | null;
  /** Non-null when the keyboard must be passed to this player before continuing. */
  readonly handoffTo: PlayerId | null;
  /** The keyboard holder's redacted view of the state. */
  readonly view: PlayerView | null;
  /** Legal commands for the keyboard holder. */
  readonly legal: readonly Command[];
  readonly netWorth: Readonly<Record<PlayerId, number>>;
  readonly events: readonly GameEvent[];
  /**
   * Events relevant to the person at (or about to take) the keyboard: after one
   * of their own commands, the events that command produced; on a hand-off,
   * everything that happened since their previous turn. Presentation only.
   */
  readonly recentEvents: readonly GameEvent[];
  readonly commandCount: number;
  readonly lastError: { readonly code: RuleViolationCode; readonly message: string } | null;
  readonly timer: TimerInfo | null;
  /** In an auction: players who chose "no bid" on this keyboard. */
  readonly passed: readonly PlayerId[];
}

const STORAGE_KEY = 'fortune-district.hotseat.v1';

interface Saved {
  readonly state: GameState;
  readonly commands: Command[];
  readonly keyboard: PlayerId | null;
  readonly config: HostConfig;
  readonly passed: PlayerId[];
}

export type Listener = (snapshot: Snapshot, reason: 'change' | 'tick') => void;

export class Host {
  #state: GameState | null = null;
  #commands: Command[] = [];
  #keyboard: PlayerId | null = null;
  #passed = new Set<PlayerId>();
  #config: HostConfig;
  #lastError: { code: RuleViolationCode; message: string } | null = null;
  /** Per player: events since that player last acted (see Snapshot.recentEvents). */
  #recent = new Map<PlayerId, GameEvent[]>();
  #listener: Listener | null = null;

  #deadline: number | null = null;
  #timerTotalMs = 0;
  #timerHandle: ReturnType<typeof setInterval> | null = null;
  #decisionKey: string | null = null;

  constructor(config: HostConfig = DEFAULT_CONFIG) {
    this.#config = config;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  subscribe(listener: Listener): void {
    this.#listener = listener;
    this.#notify('change');
  }

  get config(): HostConfig {
    return this.#config;
  }

  setConfig(config: HostConfig): void {
    this.#config = config;
    this.#restartTimerIfNeeded(true);
    this.#save();
    this.#notify('change');
  }

  newMatch(players: readonly { id: PlayerId; displayName: string }[], seed: number): void {
    this.#state = createInitialState({ matchId: `hotseat-${seed}`, seed, players });
    this.#commands = [];
    this.#keyboard = null;
    this.#passed.clear();
    this.#lastError = null;
    this.#recent.clear();
    this.dispatch({ type: 'START_MATCH', by: 'host' });
  }

  static hasSavedMatch(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  }

  restore(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const saved = JSON.parse(raw) as Saved;
      this.#state = saved.state;
      this.#commands = saved.commands;
      this.#keyboard = saved.keyboard;
      this.#config = saved.config;
      this.#passed = new Set(saved.passed);
      this.#lastError = null;
      this.#recent.clear();
      this.#afterChange([]);
      return true;
    } catch {
      return false;
    }
  }

  abandon(): void {
    this.#stopTimer();
    this.#state = null;
    this.#commands = [];
    this.#keyboard = null;
    this.#passed.clear();
    this.#lastError = null;
    this.#recent.clear();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    this.#notify('change');
  }

  // ---------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------

  dispatch(command: Command): boolean {
    if (!this.#state) return false;
    const result = applyCommand(this.#state, command);
    if (!result.ok) {
      this.#lastError = { code: result.error.code, message: result.error.message };
      this.#notify('change');
      return false;
    }
    this.#state = result.state;
    this.#commands.push(command);
    this.#lastError = null;
    // The keyboard holder sees only what their own command produced; everyone
    // else accumulates what happened while they were away.
    for (const p of result.state.players) {
      const mine = p.id === this.#keyboard && command.by === this.#keyboard;
      const prev = this.#recent.get(p.id) ?? [];
      this.#recent.set(p.id, mine ? [...result.events] : [...prev, ...result.events]);
    }
    this.#afterChange(result.events);
    return true;
  }

  /**
   * Presentation only (spec §2.5 "tooltip explains why, from the engine's
   * reason"): why would `command` be refused right now? Dry-runs the pure
   * engine on the authoritative state; the result is discarded — nothing is
   * stored, saved or notified.
   */
  explain(command: Command): { readonly code: RuleViolationCode; readonly message: string } | null {
    if (!this.#state) return null;
    const result = applyCommand(this.#state, command);
    return result.ok ? null : { code: result.error.code, message: result.error.message };
  }

  /** Read-only fingerprint of the authoritative state (tests prove `explain` leaves it unchanged). */
  stateHash(): string | null {
    return this.#state ? hashState(this.#state) : null;
  }

  /** The player named by the hand-off screen has sat down at the keyboard. */
  ready(): void {
    const actor = this.#actor();
    if (actor === null || actor === 'host') return;
    this.#keyboard = actor;
    this.#restartTimerIfNeeded(true);
    this.#save();
    this.#notify('change');
  }

  /** Auction only: the keyboard holder submits no bid. Not a rule — not bidding is "no bid". */
  pass(): void {
    if (!this.#state || this.#state.phase.kind !== 'auction' || !this.#keyboard) return;
    this.#passed.add(this.#keyboard);
    this.#afterChange([]);
  }

  exportLog(): string {
    if (!this.#state) return '';
    return JSON.stringify(
      {
        matchId: this.#state.matchId,
        seed: this.#state.config.seed,
        players: this.#state.config.players,
        commands: this.#commands,
        events: this.#state.eventLog,
      },
      null,
      2,
    );
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * Who must act. During an auction the engine's whoseDecision walks eligible
   * bidders who have not bid; the host additionally skips players who chose
   * "no bid" on this keyboard so the sequence terminates.
   */
  #actor(): Actor | null {
    const s = this.#state;
    if (!s) return null;
    if (s.phase.kind === 'auction' && s.auction) {
      const next = s.auction.eligible.find(
        (id) => !this.#passed.has(id) && legalCommands(s, id).some((c) => c.type === 'SUBMIT_SEALED_BID'),
      );
      return next ?? 'host';
    }
    return whoseDecision(s);
  }

  #afterChange(events: readonly GameEvent[]): void {
    if (!this.#state) return;
    if (events.some((e) => e.type === 'AUCTION_OPENED')) this.#passed.clear();
    if (events.some((e) => e.type === 'AUCTION_RESOLVED')) this.#passed.clear();

    // Host-only decisions never wait for a keyboard.
    const actor = this.#actor();
    if (actor === 'host' && this.#state.phase.kind === 'auction') {
      this.dispatch({ type: 'CLOSE_AUCTION', by: 'host' });
      return;
    }

    this.#restartTimerIfNeeded(false);
    this.#save();
    this.#notify('change');
  }

  #restartTimerIfNeeded(force: boolean): void {
    const s = this.#state;
    const actor = this.#actor();
    if (!s || actor === null || actor === 'host' || actor !== this.#keyboard || s.phase.kind === 'ended') {
      this.#stopTimer();
      this.#decisionKey = null;
      return;
    }
    const key = `${s.nextSeq}:${actor}:${s.phase.kind}`;
    if (!force && key === this.#decisionKey && this.#deadline !== null) return;
    this.#decisionKey = key;
    const seconds = s.phase.kind === 'auction' ? this.#config.auctionSeconds : this.#config.decisionSeconds;
    if (seconds === null) {
      this.#stopTimer();
      return;
    }
    this.#startTimer(seconds * 1000);
  }

  #startTimer(ms: number): void {
    this.#stopTimer();
    this.#timerTotalMs = ms;
    this.#deadline = Date.now() + ms;
    this.#timerHandle = setInterval(() => {
      if (this.#deadline === null) return;
      if (Date.now() >= this.#deadline) {
        this.#onTimeout();
      } else {
        this.#notify('tick');
      }
    }, 200);
  }

  #stopTimer(): void {
    if (this.#timerHandle !== null) clearInterval(this.#timerHandle);
    this.#timerHandle = null;
    this.#deadline = null;
  }

  #onTimeout(): void {
    this.#stopTimer();
    const s = this.#state;
    if (!s) return;
    if (s.phase.kind === 'auction') {
      this.pass();
    } else if (s.phase.kind === 'turn') {
      this.dispatch({ type: 'TURN_TIMED_OUT', by: 'host' });
    }
  }

  #save(): void {
    if (!this.#state) return;
    try {
      const saved: Saved = {
        state: this.#state,
        commands: this.#commands,
        keyboard: this.#keyboard,
        config: this.#config,
        passed: [...this.#passed],
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      /* storage unavailable — the match still runs in memory */
    }
  }

  #snapshot(): Snapshot {
    const s = this.#state;
    if (!s) {
      return {
        phase: 'setup',
        config: this.#config,
        seed: null,
        keyboard: null,
        actor: null,
        handoffTo: null,
        view: null,
        legal: [],
        netWorth: {},
        events: [],
        recentEvents: [],
        commandCount: 0,
        lastError: this.#lastError,
        timer: null,
        passed: [],
      };
    }
    const actor = this.#actor();
    const ended = s.phase.kind === 'ended';
    const handoffTo = !ended && actor !== null && actor !== 'host' && actor !== this.#keyboard ? actor : null;
    const viewer = this.#keyboard ?? s.players[0]?.id ?? null;
    const netWorth: Record<PlayerId, number> = {};
    for (const p of s.players) netWorth[p.id] = computeNetWorth(s, p.id);
    const recentFor = handoffTo ?? this.#keyboard;
    const recentEvents = recentFor ? (this.#recent.get(recentFor) ?? []) : [];
    const timer =
      this.#deadline !== null && !handoffTo
        ? { remainingMs: Math.max(0, this.#deadline - Date.now()), totalMs: this.#timerTotalMs }
        : null;
    return {
      phase: ended ? 'ended' : 'playing',
      config: this.#config,
      seed: s.config.seed,
      keyboard: this.#keyboard,
      actor,
      handoffTo,
      view: viewer ? projectForPlayer(s, viewer) : null,
      legal: this.#keyboard && !handoffTo ? legalCommands(s, this.#keyboard) : [],
      netWorth,
      events: s.eventLog,
      recentEvents,
      commandCount: this.#commands.length,
      lastError: this.#lastError,
      timer,
      passed: [...this.#passed],
    };
  }

  #notify(reason: 'change' | 'tick'): void {
    this.#listener?.(this.#snapshot(), reason);
  }
}
