/** @vitest-environment jsdom */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Suit } from '../shared/engine/types.ts';
import { UpcardWheel, buildWheelSequence } from '../src/ui/UpcardWheel.tsx';

const ALL_SUITS: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];

describe('buildWheelSequence', () => {
  it('always ends on the real suit, for every suit', () => {
    for (const suit of ALL_SUITS) {
      const seq = buildWheelSequence(suit);
      expect(seq[seq.length - 1]).toBe(suit);
    }
  });

  it('always passes every suit at least twice before landing (two full laps)', () => {
    for (const suit of ALL_SUITS) {
      const seq = buildWheelSequence(suit);
      // The two full laps are the first 8 entries; every suit must appear at least twice
      // within them regardless of which suit is the target.
      const firstTwoLaps = seq.slice(0, 8);
      for (const s of ALL_SUITS) {
        const count = firstTwoLaps.filter((x) => x === s).length;
        expect(count).toBe(2);
      }
    }
  });

  it('the sequence length is always LAPS*4 + (target index + 1)', () => {
    // clubs=0, diamonds=1, hearts=2, spades=3
    expect(buildWheelSequence('clubs')).toHaveLength(9);
    expect(buildWheelSequence('diamonds')).toHaveLength(10);
    expect(buildWheelSequence('hearts')).toHaveLength(11);
    expect(buildWheelSequence('spades')).toHaveLength(12);
  });
});

describe('UpcardWheel', () => {
  it('renders one frame per sequence entry, with only the last marked final', () => {
    const { container } = render(<UpcardWheel suit="hearts" durationMs={500} />);
    const frames = container.querySelectorAll('.upcard-wheel-frame');
    expect(frames).toHaveLength(buildWheelSequence('hearts').length);
    const finals = container.querySelectorAll('.upcard-wheel-frame.is-final');
    expect(finals).toHaveLength(1);
    // The final frame's image must be the real suit's icon.
    expect(finals[0]?.getAttribute('src')).toBe('/art/suits/hearts.png');
  });
});
