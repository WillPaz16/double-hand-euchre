import type { Config } from './types.ts';

export const DEFAULT_CONFIG: Config = {
  stickTheDealer: true,
  gameTarget: 10,
  lonerPoints: {
    standard: 4,
    blind_trump: 6,
    full_blind: 8,
  },
};
