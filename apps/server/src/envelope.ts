/**
 * Builds the frozen { playerView, presence, deadline } envelope for ONE
 * recipient (decision 8 / D3 / D7). The playerView is the engine's own
 * projection — rng removed, other players' sealed bids replaced by myBid —
 * so redaction lives in the engine, not here.
 */

import { projectForPlayer } from './engine.ts';
import type { GameState, PlayerId } from './engine.ts';
import type { Deadline, Envelope, Presence } from './messages.ts';

export function buildEnvelope(state: GameState | null, recipient: PlayerId, presence: Presence, deadline: Deadline | null): Envelope {
  return {
    playerView: state ? projectForPlayer(state, recipient) : null,
    presence,
    deadline,
  };
}
