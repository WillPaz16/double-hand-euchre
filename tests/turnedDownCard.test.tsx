/** @vitest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PlayerView } from '../shared/engine/types.ts';
import { Table } from '../src/ui/Table.tsx';

function makeView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    you: 'A',
    phase: 'bidding_round1',
    dealer: 'B',
    gameScore: { A: 0, B: 0 },
    winner: null,
    ownSelectedHand: [],
    ownBlindHand: null,
    opponentSelectedCount: 5,
    opponentBlindCount: 5,
    opponentSelectedHand: null,
    opponentBlindHand: null,
    upcard: { rank: 'A', suit: 'spades' },
    turnedDownSuit: null,
    trump: null,
    maker: null,
    loner: false,
    currentTrick: [],
    tricksWon: { A: 0, B: 0 },
    trickNumber: 0,
    handsPlayed: 0,
    ...overrides,
  } as PlayerView;
}

/** "Turned down" is a physical act: once round one passes out, the dealer turns the upcard face
 *  down on the deck, and that turned-down suit is then the one suit nobody may name. The card
 *  stayed face up through round two, which showed the opposite of what the rules had just done
 *  and left the player reading a face that no longer meant anything. */
describe('the upcard is physically turned down in round two', () => {
  it('shows its face during round one', async () => {
    render(
      <Table
        view={makeView({ phase: 'bidding_round1' })}
        completedTrick={null}
        lastBotAction={null}
      />,
    );
    // The reveal wheel covers the card for its first 500ms; wait it out rather than assert
    // against the animation.
    await waitFor(() => expect(document.querySelector('.kitty-upcard')).not.toBeNull(), {
      timeout: 2000,
    });
    expect(document.querySelector('.kitty-upcard-down')).toBeNull();
  });

  it('is face DOWN once round one has passed out', async () => {
    render(
      <Table
        view={makeView({ phase: 'bidding_round2', turnedDownSuit: 'spades' })}
        completedTrick={null}
        lastBotAction={null}
      />,
    );
    await waitFor(() => expect(document.querySelector('.kitty-upcard-down')).not.toBeNull(), {
      timeout: 2000,
    });
    // and its rank/suit is no longer readable anywhere on the felt
    expect(screen.queryByLabelText(/ace of spades/i)).toBeNull();
  });
});
