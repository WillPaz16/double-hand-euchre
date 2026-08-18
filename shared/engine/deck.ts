import type { Card, Player, PlayerHands, Rank, Suit } from './types.ts';

export const SUITS: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
export const RANKS: Rank[] = ['9', '10', 'J', 'Q', 'K', 'A'];

export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

/** xmur3 string hash -> mulberry32 PRNG. Deterministic, no dependency, ~10 lines. */
function seededRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffledDeck(seed: string): Card[] {
  const deck = fullDeck();
  const rng = seededRng(seed);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = deck[i]!;
    deck[i] = deck[j]!;
    deck[j] = tmp;
  }
  return deck;
}

export interface Deal {
  players: Record<Player, PlayerHands>;
  kitty: Card[];
}

/** Deals two 5-card packets to each player plus a 4-card kitty from a seeded shuffle. */
export function deal(seed: string): Deal {
  const deck = shuffledDeck(seed);
  const draw = (n: number): Card[] => deck.splice(0, n);

  const players: Record<Player, PlayerHands> = {
    A: { packets: [draw(5), draw(5)], selectedHand: null, blindHand: null },
    B: { packets: [draw(5), draw(5)], selectedHand: null, blindHand: null },
  };
  const kitty = draw(4);

  return { players, kitty };
}
