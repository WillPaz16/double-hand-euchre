import { describe, expect, it } from 'vitest';
import { actingHand, legalActions, reduce } from '../shared/engine/index.ts';
import { DEFAULT_CONFIG } from '../shared/engine/config.ts';
import type { Card, GameState, LonerTier, Player } from '../shared/engine/types.ts';
import { makePlayState } from './helpers.ts';

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

/** Drives a play-phase state to settlement by always playing the acting hand's chosen card,
 *  preferring the strongest available so trick counts are controllable. `stopAfter` lets a
 *  test hand the maker a fixed number of tricks and then throw the rest. */
function playAll(state: GameState): GameState {
  let s = state;
  let guard = 0;
  while (s.phase === 'play' && guard++ < 60) {
    const hand = actingHand(s);
    const legal = legalActions(s, hand!.player);
    if (!legal.length) break;
    s = reduce(s, legal[0]!);
  }
  return s;
}

/** Trump hands stacked so the maker takes every trick: right bower down. */
const MAKER_SWEEP = {
  nonDealerSelected: [c('J', 'spades'), c('A', 'spades'), c('K', 'spades'), c('Q', 'spades'), c('10', 'spades')],
  dealerSelected: [c('9', 'hearts'), c('10', 'hearts'), c('Q', 'hearts'), c('K', 'hearts'), c('A', 'hearts')],
  nonDealerBlind: [c('9', 'clubs'), c('10', 'clubs'), c('Q', 'clubs'), c('K', 'clubs'), c('A', 'clubs')],
  dealerBlind: [c('9', 'diamonds'), c('10', 'diamonds'), c('Q', 'diamonds'), c('K', 'diamonds'), c('A', 'diamonds')],
};

function settle(lonerTier: LonerTier | null, maker: Player = 'A') {
  const state = makePlayState({ dealer: 'B', trump: 'spades', maker, lonerTier, hands: MAKER_SWEEP });
  return playAll(state);
}

describe('loner scoring pays the configured tier', () => {
  it('a march with no loner is worth 2', () => {
    const s = settle(null);
    expect(s.tricksWon.A).toBe(5);
    expect(s.gameScore.A).toBe(2);
  });

  it('a standard loner march is worth 4, not 2', () => {
    const s = settle('standard');
    expect(s.tricksWon.A).toBe(5);
    expect(s.gameScore.A).toBe(DEFAULT_CONFIG.lonerPoints.standard);
    expect(s.gameScore.A).toBe(4);
  });

  it('a blind-hand loner march is worth 6', () => {
    const s = settle('blind_hand');
    expect(s.gameScore.A).toBe(6);
  });

  it('a full-blind loner march is worth 8', () => {
    const s = settle('full_blind');
    expect(s.gameScore.A).toBe(8);
  });

  it('going alone removes the maker\'s blind hand from the ring', () => {
    const alone = makePlayState({ dealer: 'B', trump: 'spades', maker: 'A', lonerTier: 'standard', hands: MAKER_SWEEP });
    const together = makePlayState({ dealer: 'B', trump: 'spades', maker: 'A', lonerTier: null, hands: MAKER_SWEEP });
    expect(alone.ringOrder!.length).toBe(together.ringOrder!.length - 1);
    expect(alone.ringOrder!.some((h) => h.player === 'A' && h.role === 'blind')).toBe(false);
  });
});

/** The scoring branch that is easy to get wrong: a loner who does NOT sweep. Standard euchre
 *  pays 1 for 3 or 4 tricks whether or not they went alone — the bonus is for the march only —
 *  and pays the DEFENDER 2 for a euchre regardless of the tier the maker was attempting. */
describe('a loner who falls short scores like anyone else', () => {
  const MAKER_EUCHRED = {
    nonDealerSelected: [c('9', 'clubs'), c('10', 'clubs'), c('Q', 'clubs'), c('K', 'clubs'), c('9', 'hearts')],
    dealerSelected: [c('J', 'spades'), c('A', 'spades'), c('K', 'spades'), c('Q', 'spades'), c('10', 'spades')],
    nonDealerBlind: [c('9', 'diamonds'), c('10', 'diamonds'), c('Q', 'diamonds'), c('K', 'diamonds'), c('A', 'diamonds')],
    dealerBlind: [c('A', 'clubs'), c('J', 'clubs'), c('A', 'hearts'), c('K', 'hearts'), c('Q', 'hearts')],
  };

  it('a euchred loner hands the defender 2, not the loner bonus', () => {
    const s = playAll(
      makePlayState({ dealer: 'B', trump: 'spades', maker: 'A', lonerTier: 'full_blind', hands: MAKER_EUCHRED }),
    );
    expect(s.tricksWon.A).toBeLessThan(3);
    expect(s.gameScore.B).toBe(2);
    expect(s.gameScore.A).toBe(0);
  });
});
