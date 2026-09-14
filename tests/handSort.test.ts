import { describe, expect, it } from 'vitest';
import { sortHandForDisplay } from '../shared/engine/index.ts';
import type { Card } from '../shared/engine/types.ts';

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });
const show = (h: Card[]) => h.map((x) => `${x.rank}${x.suit[0]}`).join(' ');

describe('a hand is ordered for reading', () => {
  it('puts trump leftmost, strongest first', () => {
    const hand = [c('9', 'hearts'), c('A', 'spades'), c('J', 'spades'), c('K', 'hearts'), c('9', 'spades')];
    expect(show(sortHandForDisplay(hand, 'spades'))).toBe('Js As 9s Kh 9h');
  });

  /** The card this exists for. Under spades, the jack of CLUBS is the left bower — it is a
   *  spade, and a player reading their hand needs it sitting with the spades. Sorting on
   *  `card.suit` files it under clubs, next to cards it cannot be played as. */
  it('files the left bower with trump, not with its printed suit', () => {
    const hand = [c('A', 'clubs'), c('J', 'clubs'), c('9', 'spades'), c('10', 'diamonds')];
    const sorted = sortHandForDisplay(hand, 'spades');
    // Non-trump suits follow SUITS order (clubs, diamonds, hearts), so clubs precedes
    // diamonds — my first expectation here had that backwards, not the code.
    expect(show(sorted)).toBe('Jc 9s Ac 10d');
    // and it outranks the ace of trump's own suit only because it IS trump
    expect(sorted[0]).toEqual(c('J', 'clubs'));
  });

  it('keeps the right bower ahead of the left', () => {
    const hand = [c('J', 'clubs'), c('J', 'spades')];
    expect(show(sortHandForDisplay(hand, 'spades'))).toBe('Js Jc');
  });

  it('falls back to suit then rank before trump is named', () => {
    const hand = [c('9', 'hearts'), c('A', 'clubs'), c('K', 'hearts'), c('10', 'clubs')];
    expect(show(sortHandForDisplay(hand, null))).toBe('Ac 10c Kh 9h');
  });

  it('never mutates the hand it is given', () => {
    const hand = [c('9', 'hearts'), c('A', 'spades')];
    const before = show(hand);
    sortHandForDisplay(hand, 'spades');
    expect(show(hand)).toBe(before);
  });
});
