import { describe, it, expect } from 'vitest';
import type { Card, TrickCard } from '../shared/engine/types.ts';
import {
  effectiveSuit,
  isRightBower,
  isLeftBower,
  legalPlays,
  trickWinnerIndex,
} from '../shared/engine/rules.ts';

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

describe('bowers', () => {
  it('right bower is the jack of the trump suit', () => {
    expect(isRightBower(c('J', 'hearts'), 'hearts')).toBe(true);
    expect(isRightBower(c('J', 'diamonds'), 'hearts')).toBe(false);
  });

  it('left bower is the jack of the same-color suit', () => {
    expect(isLeftBower(c('J', 'diamonds'), 'hearts')).toBe(true);
    expect(isLeftBower(c('J', 'clubs'), 'hearts')).toBe(false);
    expect(isLeftBower(c('J', 'clubs'), 'spades')).toBe(true);
  });

  it('left bower counts as trump for effective suit', () => {
    expect(effectiveSuit(c('J', 'diamonds'), 'hearts')).toBe('hearts');
    expect(effectiveSuit(c('J', 'clubs'), 'hearts')).toBe('clubs');
  });
});

describe('legalPlays (follow suit)', () => {
  const trump = 'hearts';

  it('must follow the led effective suit when possible', () => {
    const hand = [c('9', 'clubs'), c('A', 'clubs'), c('K', 'hearts')];
    const plays = legalPlays(hand, 'clubs', trump);
    expect(plays).toEqual([c('9', 'clubs'), c('A', 'clubs')]);
  });

  it('left bower counts as trump, not its printed suit, when following', () => {
    // Led suit is trump (hearts). Holding the left bower (J diamonds) must be played
    // as if following hearts, even though nothing else in hand is a heart.
    const hand = [c('J', 'diamonds'), c('9', 'clubs')];
    const plays = legalPlays(hand, 'hearts', trump);
    expect(plays).toEqual([c('J', 'diamonds')]);
  });

  it('any card is legal when the hand cannot follow', () => {
    const hand = [c('9', 'clubs'), c('K', 'spades')];
    const plays = legalPlays(hand, 'hearts', trump);
    expect(plays).toEqual(hand);
  });

  it('leading (no led suit) allows any card', () => {
    const hand = [c('9', 'clubs'), c('K', 'spades')];
    expect(legalPlays(hand, null, trump)).toEqual(hand);
  });
});

describe('trickWinnerIndex', () => {
  const trump = 'hearts';
  const trick = (cards: Card[]): TrickCard[] =>
    cards.map((card, i) => ({ handId: { player: i % 2 === 0 ? 'A' : 'B', role: 'selected' }, card }));

  it('right bower beats left bower beats ace of trump', () => {
    const t = trick([c('A', 'hearts'), c('J', 'diamonds'), c('J', 'hearts'), c('9', 'hearts')]);
    expect(trickWinnerIndex(t, trump)).toBe(2); // right bower
  });

  it('any trump beats any non-trump regardless of led suit', () => {
    const t = trick([c('A', 'clubs'), c('9', 'hearts'), c('K', 'clubs'), c('Q', 'clubs')]);
    expect(trickWinnerIndex(t, trump)).toBe(1); // the lone trump card
  });

  it('highest card of the led suit wins when no trump is played', () => {
    const t = trick([c('9', 'clubs'), c('A', 'clubs'), c('K', 'clubs'), c('Q', 'clubs')]);
    expect(trickWinnerIndex(t, trump)).toBe(1); // ace of the led suit
  });

  it('off-suit non-trump cards can never win', () => {
    const t = trick([c('A', 'clubs'), c('9', 'spades'), c('9', 'clubs'), c('10', 'clubs')]);
    expect(trickWinnerIndex(t, trump)).toBe(0); // ace of led suit; the 9 of spades is dead
  });

  it('leading the left bower means trump was led, not its printed suit', () => {
    // Led card is the left bower (J diamonds under hearts trump) -> led effective suit is hearts.
    // A diamond ace does NOT follow (diamonds isn't the effective led suit) and cannot win.
    const t = trick([c('J', 'diamonds'), c('A', 'diamonds'), c('9', 'hearts'), c('K', 'spades')]);
    expect(trickWinnerIndex(t, trump)).toBe(0); // left bower is trump and wins
  });
});
