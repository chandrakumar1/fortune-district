/**
 * Bots for exercising the rules (SIMULATOR_SPEC §2). They are not meant to
 * play well. Each bot sees only its PlayerView and the engine's legal
 * commands; a bot's own randomness comes from a seeded RNG owned by the bot.
 */

import { createRng, nextInt } from './engine.ts';
import type { Command, PlayerId, PlayerView, RngState } from './engine.ts';

export interface AuctionView {
  readonly tileIndex: number;
  readonly minimumBid: number;
  readonly listPrice: number;
  readonly cash: number;
}

export interface Bot {
  readonly name: string;
  /** Seconds this bot "takes" per decision, for the match-duration metric. */
  readonly latencySeconds: number;
  /** null = no decision in time → host issues TURN_TIMED_OUT. */
  decide(view: PlayerView, legal: readonly Command[]): Command | null;
  /** null = no bid. Must be an integer in [minimumBid, cash] or it is dropped. */
  bid(view: PlayerView, auction: AuctionView): number | null;
}

export type BotKind = 'random' | 'passive' | 'greedy' | 'timeout';

export function createBot(kind: BotKind, playerId: PlayerId, seed: number): Bot {
  switch (kind) {
    case 'random':
      return new RandomBot(playerId, seed);
    case 'passive':
      return new PassiveBot();
    case 'greedy':
      return new GreedyBot(playerId);
    case 'timeout':
      return new TimeoutBot();
  }
}

/** Uniform over legal commands; bids uniformly in [min, cash]. */
export class RandomBot implements Bot {
  readonly name = 'random';
  readonly latencySeconds = 3;
  #rng: RngState;
  readonly #id: PlayerId;

  constructor(id: PlayerId, seed: number) {
    this.#id = id;
    this.#rng = createRng(seed);
  }

  decide(_view: PlayerView, legal: readonly Command[]): Command | null {
    if (legal.length === 0) return null;
    const r = nextInt(this.#rng, legal.length);
    this.#rng = r.rng;
    return legal[r.value] ?? null;
  }

  bid(_view: PlayerView, a: AuctionView): number | null {
    if (a.cash < a.minimumBid) return null;
    const r = nextInt(this.#rng, a.cash - a.minimumBid + 1);
    this.#rng = r.rng;
    return a.minimumBid + r.value;
  }

  get id(): PlayerId {
    return this.#id;
  }
}

/** Never buys, never bids, never upgrades. */
export class PassiveBot implements Bot {
  readonly name = 'passive';
  readonly latencySeconds = 1;

  decide(_view: PlayerView, legal: readonly Command[]): Command | null {
    return (
      legal.find((c) => c.type === 'ADVANCE') ??
      legal.find((c) => c.type === 'DECLINE_PROPERTY') ??
      legal.find((c) => c.type === 'END_TURN') ??
      legal[0] ??
      null
    );
  }

  bid(): number | null {
    return null;
  }
}

/** Buys whenever affordable, upgrades whenever affordable, bids a quarter of cash. */
export class GreedyBot implements Bot {
  readonly name = 'greedy';
  readonly latencySeconds = 5;
  readonly #id: PlayerId;

  constructor(id: PlayerId) {
    this.#id = id;
  }

  decide(view: PlayerView, legal: readonly Command[]): Command | null {
    return (
      legal.find((c) => c.type === 'ADVANCE') ??
      legal.find((c) => c.type === 'BUY_PROPERTY') ??
      legal.find((c) => c.type === 'DECLINE_PROPERTY') ??
      legal.find((c) => c.type === 'UPGRADE_PROPERTY') ??
      legal.find((c) => c.type === 'USE_LEVERAGE_TOKEN' && c.payload.kind === 'force_auction') ??
      legal.find((c) => c.type === 'REROLL_PULSE' && this.nextPulseHurtsMe(view)) ??
      legal.find((c) => c.type === 'END_TURN') ??
      legal[0] ??
      null
    );
  }

  bid(_view: PlayerView, a: AuctionView): number | null {
    const want = Math.max(a.minimumBid, Math.floor(a.cash / 4));
    return want <= a.cash ? Math.min(want, a.listPrice, a.cash) : null;
  }

  private nextPulseHurtsMe(view: PlayerView): boolean {
    const next = view.state.cityPulse.schedule.find((e) => e.round > view.state.round);
    if (!next) return false;
    return view.state.board.some(
      (t) => t.kind === 'property' && t.category === next.suppressed && view.state.ownership[t.index] === this.#id,
    );
  }
}

/** Never decides: every turn times out. Exercises the R11 defaults. */
export class TimeoutBot implements Bot {
  readonly name = 'timeout';
  readonly latencySeconds = 0;
  decide(): Command | null {
    return null;
  }
  bid(): number | null {
    return null;
  }
}
