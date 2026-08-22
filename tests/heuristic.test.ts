import { describe, expect, it } from 'vitest';
import type { Action, Card, PlayerView } from '../shared/engine/types.ts';
import { chooseMove } from '../shared/bot/heuristic.ts';

/** Direct tests for the heuristic bot — it had none before this (only exercised incidentally
 *  by the fullGame liveness soak, which asserts games finish, not that moves are sane). Pinned
 *  here BEFORE 2h.5 changes its evaluation, so that phase has a baseline to diff against
 *  rather than discovering behaviour changes only by playing the game. */

function c(rank: Card['rank'], suit: Card['suit']): Card {
  return { rank, suit };
}

function makeView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    you: 'B',
    phase: 'play',
    dealer: 'A',
    gameScore: { A: 0, B: 0 },
    winner: null,
    ownSelectedHand: null,
    ownBlindHand: null,
    opponentSelectedCount: 5,
    opponentBlindCount: 5,
    opponentSelectedHand: null,
    opponentBlindHand: null,
    upcard: null,
    turnedDownSuit: null,
    trump: null,
    maker: null,
    lonerTier: null,
    currentTrick: [],
    tricksWon: { A: 0, B: 0 },
    trickNumber: 1,
    actingHand: null,
    ...overrides,
  };
}

describe('chooseMove: trivial cases', () => {
  it('returns the only legal action without consulting phase logic at all', () => {
    const only: Action = { type: 'PASS', player: 'B' };
    expect(chooseMove(makeView({ phase: 'bidding_round1' }), [only])).toBe(only);
  });

  it('throws if handed no legal actions — a bot with nothing to do is a caller bug', () => {
    expect(() => chooseMove(makeView(), [])).toThrow();
  });
});

describe('chooseMove: select', () => {
  it('always picks the first packet — both are equally unknown before the pick', () => {
    const legal: Action[] = [
      { type: 'SELECT_HAND', player: 'B', packetIndex: 0 },
      { type: 'SELECT_HAND', player: 'B', packetIndex: 1 },
    ];
    const chosen = chooseMove(makeView({ phase: 'select' }), legal);
    expect(chosen).toEqual({ type: 'SELECT_HAND', player: 'B', packetIndex: 0 });
  });
});

describe('chooseMove: both blind loner windows pass unconditionally', () => {
  it('loner_full_blind: passes even when going alone is legal', () => {
    const legal: Action[] = [
      { type: 'DECLARE_FULL_BLIND_LONER', player: 'B' },
      { type: 'PASS', player: 'B' },
    ];
    expect(chooseMove(makeView({ phase: 'loner_full_blind' }), legal)).toEqual({
      type: 'PASS',
      player: 'B',
    });
  });

  it('loner_blind_hand: passes even when going alone is legal', () => {
    const legal: Action[] = [
      { type: 'DECLARE_BLIND_HAND_LONER', player: 'B' },
      { type: 'PASS', player: 'B' },
    ];
    expect(chooseMove(makeView({ phase: 'loner_blind_hand' }), legal)).toEqual({
      type: 'PASS',
      player: 'B',
    });
  });
});

describe('chooseMove: bidding_round1 (order up on the turned card)', () => {
  const legal: Action[] = [
    { type: 'ORDER_UP', player: 'B', loner: false },
    { type: 'ORDER_UP', player: 'B', loner: true },
    { type: 'PASS', player: 'B' },
  ];

  it('passes with fewer than 3 trump', () => {
    const hand = [c('9', 'hearts'), c('9', 'clubs'), c('9', 'diamonds'), c('9', 'spades'), c('A', 'clubs')];
    const view = makeView({ phase: 'bidding_round1', ownSelectedHand: hand, upcard: c('K', 'hearts') });
    expect(chooseMove(view, legal)).toEqual({ type: 'PASS', player: 'B' });
  });

  it('orders up (no loner) with exactly 3 trump', () => {
    const hand = [c('9', 'hearts'), c('10', 'hearts'), c('A', 'hearts'), c('9', 'clubs'), c('9', 'spades')];
    const view = makeView({ phase: 'bidding_round1', ownSelectedHand: hand, upcard: c('K', 'hearts') });
    expect(chooseMove(view, legal)).toEqual({ type: 'ORDER_UP', player: 'B', loner: false });
  });

  it('orders up ALONE with 4 or more trump', () => {
    const hand = [c('9', 'hearts'), c('10', 'hearts'), c('A', 'hearts'), c('K', 'hearts'), c('9', 'spades')];
    const view = makeView({ phase: 'bidding_round1', ownSelectedHand: hand, upcard: c('Q', 'hearts') });
    expect(chooseMove(view, legal)).toEqual({ type: 'ORDER_UP', player: 'B', loner: true });
  });

  it('the left bower counts as trump when weighing whether to order up', () => {
    // J of diamonds is the left bower when hearts is trump — 3 "trump" cards here even
    // though only 2 are literally hearts.
    const hand = [c('J', 'diamonds'), c('9', 'hearts'), c('10', 'hearts'), c('9', 'clubs'), c('9', 'spades')];
    const view = makeView({ phase: 'bidding_round1', ownSelectedHand: hand, upcard: c('K', 'hearts') });
    expect(chooseMove(view, legal)).toEqual({ type: 'ORDER_UP', player: 'B', loner: false });
  });
});

describe('chooseMove: bidding_round2 (naming a suit)', () => {
  it('names the suit it holds the most trump in, when it clears the threshold', () => {
    const hand = [c('9', 'clubs'), c('10', 'clubs'), c('A', 'clubs'), c('9', 'hearts'), c('9', 'spades')];
    const legal: Action[] = [
      { type: 'NAME_TRUMP', player: 'B', suit: 'clubs', loner: false },
      { type: 'NAME_TRUMP', player: 'B', suit: 'clubs', loner: true },
      { type: 'NAME_TRUMP', player: 'B', suit: 'spades', loner: false },
      { type: 'NAME_TRUMP', player: 'B', suit: 'spades', loner: true },
      { type: 'PASS', player: 'B' },
    ];
    const view = makeView({ phase: 'bidding_round2', ownSelectedHand: hand });
    expect(chooseMove(view, legal)).toEqual({ type: 'NAME_TRUMP', player: 'B', suit: 'clubs', loner: false });
  });

  it('passes below threshold when passing is legal', () => {
    const hand = [c('9', 'clubs'), c('9', 'hearts'), c('9', 'diamonds'), c('9', 'spades'), c('A', 'clubs')];
    const legal: Action[] = [
      { type: 'NAME_TRUMP', player: 'B', suit: 'clubs', loner: false },
      { type: 'PASS', player: 'B' },
    ];
    const view = makeView({ phase: 'bidding_round2', ownSelectedHand: hand });
    expect(chooseMove(view, legal)).toEqual({ type: 'PASS', player: 'B' });
  });

  it('stick-the-dealer: names a suit anyway when passing is not legal', () => {
    const hand = [c('9', 'clubs'), c('9', 'hearts'), c('9', 'diamonds'), c('9', 'spades'), c('A', 'clubs')];
    const legal: Action[] = [
      { type: 'NAME_TRUMP', player: 'B', suit: 'clubs', loner: false },
      { type: 'NAME_TRUMP', player: 'B', suit: 'hearts', loner: false },
      { type: 'NAME_TRUMP', player: 'B', suit: 'diamonds', loner: false },
      { type: 'NAME_TRUMP', player: 'B', suit: 'spades', loner: false },
    ];
    const view = makeView({ phase: 'bidding_round2', ownSelectedHand: hand });
    const chosen = chooseMove(view, legal);
    expect(chosen.type).toBe('NAME_TRUMP');
  });
});

describe('chooseMove: dealer_exchange', () => {
  it('discards the single weakest card by strength', () => {
    const hand = [c('9', 'clubs'), c('A', 'hearts'), c('K', 'hearts'), c('Q', 'hearts'), c('10', 'clubs')];
    const legal: Action[] = hand.map((card) => ({ type: 'DEALER_DISCARD', card }));
    const view = makeView({ phase: 'dealer_exchange', ownSelectedHand: hand, trump: 'hearts' });
    // With hearts trump, the off-suit 9 and 10 of clubs are the weakest cards on the board —
    // the 9 of clubs specifically should lose to the 10 of clubs.
    expect(chooseMove(view, legal)).toEqual({ type: 'DEALER_DISCARD', card: c('9', 'clubs') });
  });
});

describe('chooseMove: play', () => {
  it('leads the highest card when the trick is empty', () => {
    const hand = [c('9', 'clubs'), c('A', 'hearts'), c('10', 'clubs')];
    const legal: Action[] = hand.map((card) => ({ type: 'PLAY_CARD', card }));
    const view = makeView({ phase: 'play', trump: 'hearts', currentTrick: [] });
    expect(chooseMove(view, legal)).toEqual({ type: 'PLAY_CARD', card: c('A', 'hearts') });
  });

  it('follows with the cheapest card that would currently win, if one can', () => {
    // Both cards are the LED suit (trump), so both are legal follows — no follow-suit
    // ambiguity here, unlike an off-suit card that would never actually be legal to offer.
    const hand = [c('10', 'hearts'), c('A', 'hearts')];
    const legal: Action[] = hand.map((card) => ({ type: 'PLAY_CARD', card }));
    const view = makeView({
      phase: 'play',
      trump: 'hearts',
      actingHand: { player: 'B', role: 'selected' },
      // Leader played the 9 of hearts — the bot's 10 alone already beats it, so the bot
      // should NOT reach for the Ace when a cheaper winner is available.
      currentTrick: [{ handId: { player: 'A', role: 'selected' }, card: c('9', 'hearts') }],
    });
    expect(chooseMove(view, legal)).toEqual({ type: 'PLAY_CARD', card: c('10', 'hearts') });
  });

  it('dumps the lowest card when nothing in hand would currently win', () => {
    const hand = [c('9', 'clubs'), c('Q', 'clubs')];
    const legal: Action[] = hand.map((card) => ({ type: 'PLAY_CARD', card }));
    const view = makeView({
      phase: 'play',
      trump: 'hearts',
      actingHand: { player: 'B', role: 'selected' },
      currentTrick: [{ handId: { player: 'A', role: 'selected' }, card: c('A', 'clubs') }],
    });
    expect(chooseMove(view, legal)).toEqual({ type: 'PLAY_CARD', card: c('9', 'clubs') });
  });
});
