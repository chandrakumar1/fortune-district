/**
 * Injectable clock (Stage B plan §4). The ONLY place in apps/server that may
 * touch Date.now or Node timers. MatchSession receives a Clock; the engine
 * never sees time (ADR-0004) — expiry reaches it as ordinary commands.
 */

export type TimerHandle = number;

export interface Clock {
  /** Milliseconds since the epoch (RealClock) or since construction (FakeClock). */
  now(): number;
  setTimeout(fn: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

export class RealClock implements Clock {
  #handles = new Map<TimerHandle, ReturnType<typeof setTimeout>>();
  #next = 1;

  now(): number {
    return Date.now();
  }

  setTimeout(fn: () => void, ms: number): TimerHandle {
    const handle = this.#next++;
    const t = setTimeout(() => {
      this.#handles.delete(handle);
      fn();
    }, ms);
    this.#handles.set(handle, t);
    return handle;
  }

  clearTimeout(handle: TimerHandle): void {
    const t = this.#handles.get(handle);
    if (t !== undefined) {
      clearTimeout(t);
      this.#handles.delete(handle);
    }
  }
}

/** Deterministic clock for tests: time moves only through advance(). */
export class FakeClock implements Clock {
  #now: number;
  #next = 1;
  #timers = new Map<TimerHandle, { readonly at: number; readonly seq: number; readonly fn: () => void }>();

  constructor(start = 0) {
    this.#now = start;
  }

  now(): number {
    return this.#now;
  }

  setTimeout(fn: () => void, ms: number): TimerHandle {
    const handle = this.#next++;
    this.#timers.set(handle, { at: this.#now + Math.max(0, ms), seq: handle, fn });
    return handle;
  }

  clearTimeout(handle: TimerHandle): void {
    this.#timers.delete(handle);
  }

  /** Number of armed timers (tests). */
  get pending(): number {
    return this.#timers.size;
  }

  /**
   * Advance time by `ms`, firing due timers in (time, arm-order) order. Timers
   * armed by a callback fire in the same advance if they fall due within it.
   */
  advance(ms: number): void {
    const target = this.#now + Math.max(0, ms);
    for (;;) {
      let next: { handle: TimerHandle; at: number; seq: number; fn: () => void } | null = null;
      for (const [handle, t] of this.#timers) {
        if (t.at > target) continue;
        if (next === null || t.at < next.at || (t.at === next.at && t.seq < next.seq)) next = { handle, at: t.at, seq: t.seq, fn: t.fn };
      }
      if (next === null) break;
      this.#timers.delete(next.handle);
      this.#now = Math.max(this.#now, next.at);
      next.fn();
    }
    this.#now = target;
  }
}
