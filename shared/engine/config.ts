import type { Config } from './types.ts';

export const DEFAULT_CONFIG: Config = {
  stickTheDealer: true,
  gameTarget: 10,
  lonerPoints: {
    standard: 4,
    blind_hand: 6,
    full_blind: 8,
  },
  // Off by default (direct user decision). The blind tiers are this game's own house rules on
  // top of standard euchre, so a new player — or a friend joining a table — starts with the
  // game they already know, and opts into them in Settings (or mid-game, from the next hand).
  lonerTiersEnabled: {
    blind_hand: false,
    full_blind: false,
  },
};
