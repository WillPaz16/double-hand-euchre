/** @vitest-environment jsdom */
import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useRef } from 'react';
import type { PlayerView } from '../shared/engine/types.ts';
import { useFlip } from '../src/ui/useFlip.ts';
import { Table } from '../src/ui/Table.tsx';

afterEach(cleanup);

/** `offsetLeft`/`offsetTop` are always 0 in a headless DOM, so a FLIP measured against the real
 *  layout engine can never produce a delta here. This stubs the two properties the hook reads,
 *  which is the entirety of its contract with layout — everything else it does (recording the
 *  previous position, inverting the delta, releasing it) is its own logic, and that is what
 *  these tests exercise. */
function stubOffsets(positions: Map<Element, number>) {
  Object.defineProperty(HTMLElement.prototype, 'offsetLeft', {
    configurable: true,
    get(this: HTMLElement) {
      return positions.get(this) ?? 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
    configurable: true,
    get: () => 0,
  });
}

function Fan({ items }: { items: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useFlip(ref);
  return (
    <div ref={ref} data-testid="fan">
      {items.map((id) => (
        <span key={id} data-id={id} />
      ))}
    </div>
  );
}

describe('useFlip', () => {
  it('records every child position, so a later move has something to tween from', () => {
    stubOffsets(new Map());
    const { getByTestId } = render(<Fan items={['a', 'b', 'c']} />);
    for (const kid of getByTestId('fan').children) {
      expect((kid as HTMLElement).dataset.flipX).toBeDefined();
    }
  });

  it('leaves a child that did not move untouched', () => {
    stubOffsets(new Map());
    const { getByTestId, rerender } = render(<Fan items={['a', 'b']} />);
    rerender(<Fan items={['a', 'b']} />);
    for (const kid of getByTestId('fan').children) {
      // Nothing to travel back from, so no inline override should ever have been written.
      expect((kid as HTMLElement).style.getPropertyValue('--flip-x')).toBe('');
    }
  });

  it('puts a child that moved back where it started, then releases it', () => {
    const positions = new Map<Element, number>();
    stubOffsets(positions);
    const { getByTestId, rerender } = render(<Fan items={['a', 'b']} />);
    const first = getByTestId('fan').children[0] as HTMLElement;

    // The card is now laid out 40px further right than it was — what happens to every survivor
    // when a sibling is removed and the fan re-centres.
    positions.set(first, 40);
    rerender(<Fan items={['a', 'b']} />);

    // Ends at zero: the hook writes the inverted offset, forces a reflow so the browser commits
    // it, then clears it in the same pass. Only the CLEARED value is observable afterwards —
    // the -40px start frame exists for exactly one reflow, and the transition does the rest.
    expect(first.style.getPropertyValue('--flip-x')).toBe('0px');
    // Position recorded for next time, so consecutive moves chain instead of only the first
    // one animating.
    expect(first.dataset.flipX).toBe('40');
  });

  it('survives a DOM with no matchMedia instead of taking the render down with it', () => {
    stubOffsets(new Map());
    const original = window.matchMedia;
    // Exactly the shape of the bare DOM some component tests render into. Assuming the API
    // exists threw from inside a layout effect, which fails the whole tree rather than merely
    // skipping an animation — it broke two unrelated Table tests when this hook was added.
    // @ts-expect-error deliberately removing an API the hook must tolerate missing
    delete window.matchMedia;
    try {
      expect(() => render(<Fan items={['a', 'b']} />)).not.toThrow();
    } finally {
      window.matchMedia = original;
    }
  });
});

function makeView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    you: 'A',
    phase: 'play',
    dealer: 'B',
    gameScore: { A: 0, B: 0 },
    winner: null,
    ownSelectedHand: [
      { rank: 'A', suit: 'hearts' },
      { rank: 'K', suit: 'hearts' },
    ],
    ownBlindHand: null,
    opponentSelectedCount: 5,
    opponentBlindCount: 5,
    opponentSelectedHand: null,
    opponentBlindHand: null,
    upcard: { rank: 'A', suit: 'spades' },
    turnedDownSuit: null,
    trump: 'hearts',
    maker: 'A',
    loner: false,
    currentTrick: [],
    tricksWon: { A: 0, B: 0 },
    trickNumber: 0,
    handsPlayed: 0,
    actingHand: { player: 'A', role: 'selected' },
    ...overrides,
  } as PlayerView;
}

/** The structural precondition for the whole card-motion pass, and the kind of thing that would
 *  otherwise regress silently: it looks purely cosmetic, and nothing else asserts it.
 *
 *  A hand you have picked up must READ as empty at its seat while its faces sit in the tray —
 *  but the card elements have to survive the update. A fan that is unmounted and rebuilt on
 *  every pick-up can only ever re-enter, never reflow, so `useFlip` has no previous position to
 *  work from and every card played replays the deal animation instead of closing the gap. That
 *  was the real behaviour for the player's own two hands, while the Old-Timer's (never held, so
 *  never remounted) got the smooth version. */
describe('a hand you have picked up', () => {
  it('keeps its cards mounted at the seat rather than unmounting them', () => {
    const { container } = render(
      <Table view={makeView()} completedTrick={null} lastBotAction={null} />,
    );
    const held = container.querySelector('.seat-fan.is-empty');
    expect(held, 'expected the acting hand to be held during play').not.toBeNull();
    expect(held!.children.length).toBeGreaterThan(0);
  });
});
