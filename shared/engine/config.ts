import type { Config } from './types.ts';

export const DEFAULT_CONFIG: Config = {
  stickTheDealer: true,
  gameTarget: 10,
  lonerPoints: {
    standard: 4,
    blind_hand: 6,
    full_blind: 8,
  },
  lonerTiersEnabled: {
    blind_hand: true,
    full_blind: true,
  },
};
