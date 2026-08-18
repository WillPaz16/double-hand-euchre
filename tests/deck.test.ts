import { describe, it, expect } from 'vitest';
import { fullDeck, shuffledDeck, deal } from '../shared/engine/deck.ts';

describe('deck', () => {
  it('has 24 unique cards', () => {
    const deck = fullDeck();
    expect(deck).toHaveLength(24);
    const keys = new Set(deck.map((c) => `${c.rank}-${c.suit}`));
    expect(keys.size).toBe(24);
  });

  it('shuffle is deterministic for a given seed', () => {
    const a = shuffledDeck('game-1');
    const b = shuffledDeck('game-1');
    expect(a).toEqual(b);
  });

  it('different seeds produce different orderings', () => {
    const a = shuffledDeck('game-1');
    const b = shuffledDeck('game-2');
    expect(a).not.toEqual(b);
  });
});

describe('deal', () => {
  it('deals two 5-card packets per player and a 4-card kitty, all 24 cards used exactly once', () => {
    const { players, kitty } = deal('seed-x');
    expect(players.A.packets![0]).toHaveLength(5);
    expect(players.A.packets![1]).toHaveLength(5);
    expect(players.B.packets![0]).toHaveLength(5);
    expect(players.B.packets![1]).toHaveLength(5);
    expect(kitty).toHaveLength(4);

    const all = [
      ...players.A.packets![0],
      ...players.A.packets![1],
      ...players.B.packets![0],
      ...players.B.packets![1],
      ...kitty,
    ];
    expect(all).toHaveLength(24);
    const keys = new Set(all.map((c) => `${c.rank}-${c.suit}`));
    expect(keys.size).toBe(24);
  });

  it('is deterministic and reproducible from its seed', () => {
    const d1 = deal('seed-x');
    const d2 = deal('seed-x');
    expect(d1).toEqual(d2);
  });
});
