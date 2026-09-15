/**
 * Decline / forced auctions: sealed bids, minimum half price, highest wins.
 */

import { AUCTION_MIN_BID_DENOMINATOR, AUCTION_MIN_BID_NUMERATOR, BOARD_TILE_COUNT } from './constants.ts';
import { DISTRICT_HUB_INDEX } from './board.ts';
import { emit, payBank, playerOf, propertyAt } from './internal.ts';
import type { Draft } from './internal.ts';
import { fraction } from './money.ts';
import type { Credits, PlayerId, TileIndex, TurnStep } from './types.ts';

export function minimumBidFor(price: Credits): Credits {
  return fraction(price, AUCTION_MIN_BID_NUMERATOR, AUCTION_MIN_BID_DENOMINATOR);
}

/** Locked rule 3: everyone is eligible, including the player who declined. */
export function openAuction(
  d: Draft,
  tileIndex: TileIndex,
  openedBy: PlayerId,
  origin: 'decline' | 'leverage',
  resumeStep: TurnStep,
): void {
  const tile = propertyAt(d, tileIndex);
  const eligible = d.players.map((p) => p.id);
  const minimumBid = minimumBidFor(tile.price);
  d.auction = { tileIndex, openedBy, origin, eligible, minimumBid, bids: {} };
  d.phase = { kind: 'auction', returnTo: openedBy, resumeStep };
  emit(d, { type: 'AUCTION_OPENED', tileIndex, origin, eligible, minimumBid });
}

export function recordBid(d: Draft, bidder: PlayerId, amount: Credits): void {
  if (!d.auction) throw new Error('no auction');
  d.auction = { ...d.auction, bids: { ...d.auction.bids, [bidder]: amount } };
  emit(d, { type: 'BID_RECEIVED', bidder });
}

/** Forward distance from a tile to the District Hub on the one-way loop (0 when standing on it). */
export function forwardDistanceToHub(position: TileIndex): number {
  return (DISTRICT_HUB_INDEX - position + BOARD_TILE_COUNT) % BOARD_TILE_COUNT;
}

/**
 * Resolve: highest bid wins and pays the bank. Equal highest bids go to the
 * bidder furthest from the Hub (greatest forward distance); same tile → lower
 * seat (R1). No RNG is consumed. No bids → the property remains unowned.
 */
export function closeAuction(d: Draft): void {
  const a = d.auction;
  const phase = d.phase;
  if (!a || phase.kind !== 'auction') throw new Error('no auction to close');
  const entries = Object.entries(a.bids).sort(([x], [y]) => seatOf(d, x) - seatOf(d, y));
  let winner: PlayerId | null = null;
  let winningBid: Credits | null = null;
  let tieBroken = false;

  if (entries.length > 0) {
    const max = Math.max(...entries.map(([, amt]) => amt));
    const top = entries.filter(([, amt]) => amt === max).map(([id]) => id);
    if (top.length === 1) {
      winner = top[0] as PlayerId;
    } else {
      // Entries are already in seat order, so the first maximum-distance bidder is the lowest seat.
      let best: PlayerId | null = null;
      let bestDistance = -1;
      for (const id of top) {
        const dist = forwardDistanceToHub(playerOf(d, id).position);
        if (dist > bestDistance) {
          best = id;
          bestDistance = dist;
        }
      }
      winner = best as PlayerId;
      tieBroken = true;
    }
    winningBid = max;
    payBank(d, winner, max, 'auction');
    d.ownership[a.tileIndex] = winner;
    d.pricePaid[a.tileIndex] = max;
    d.upgrades[a.tileIndex] = 0;
    d.upgradeSpend[a.tileIndex] = 0;
  }

  emit(d, { type: 'AUCTION_RESOLVED', tileIndex: a.tileIndex, winner, winningBid, revealedBids: { ...a.bids }, tieBroken });
  d.auction = null;
  d.phase = { kind: 'turn', activePlayer: phase.returnTo, step: phase.resumeStep };
}

function seatOf(d: Draft, id: PlayerId): number {
  const p = d.players.find((x) => x.id === id);
  return p ? p.seat : Number.MAX_SAFE_INTEGER;
}
