import type { PlayerView } from '../../shared/engine/types.ts';
import { HUMAN, BOT } from '../game/useGame.ts';

const SUIT_LABEL: Record<string, string> = {
  clubs: 'Clubs',
  diamonds: 'Diamonds',
  hearts: 'Hearts',
  spades: 'Spades',
};

export function StatusBanner({
  view,
  onRestart,
}: {
  view: PlayerView;
  onRestart?: () => void;
}) {
  // This is the game's entire TEXTUAL state channel — trump called, who's making, tricks won,
  // hand/game outcome — and until now announced none of it to a screen reader: trump gets
  // named, a trick is won, the game ends, and nothing is spoken unless the player is already
  // looking at this exact spot on screen. `role="status"` + `aria-live="polite"` on every
  // returned branch means an assistive-tech user hears each state change as it happens,
  // without the announcement interrupting whatever they're doing (the way `aria-live="assertive"`
  // would). Every branch needs it individually — `aria-live` is only observed on an element
  // already present in the accessibility tree, not retroactively when a differently-keyed
  // subtree swaps in, so it can't be hoisted to one wrapper above the phase branches.
  if (view.phase === 'game_over') {
    const message = view.winner === HUMAN ? 'You win the game!' : 'Old-Timer wins the game.';
    return (
      <div className="status-banner big" role="status" aria-live="polite">
        <div>{message}</div>
        {onRestart && (
          <button className="bid-button" onClick={onRestart}>
            Play again
          </button>
        )}
      </div>
    );
  }
  if (view.phase === 'hand_complete') {
    return (
      <div className="status-banner" role="status" aria-live="polite">
        Hand complete — dealing next hand…
      </div>
    );
  }
  if (view.phase === 'misdeal') {
    return (
      <div className="status-banner" role="status" aria-live="polite">
        Misdeal — redealing…
      </div>
    );
  }

  // The upcard itself now sits on the felt (see Table.tsx) rather than floating on the wall
  // above it. What is left here is genuinely textual status, so this is one compact strip.
  return (
    <div className="status-banner" role="status" aria-live="polite">
      {view.turnedDownSuit && (
        <div className="status-row">Turned down: {SUIT_LABEL[view.turnedDownSuit]}</div>
      )}
      {view.trump && (
        <div className="status-row">
          Trump: {SUIT_LABEL[view.trump]}
          {view.maker && <> — Maker: {view.maker === HUMAN ? 'You' : 'Old-Timer'}</>}
          {view.lonerTier && ` (${view.lonerTier.replace('_', ' ')} loner)`}
        </div>
      )}
      {/* Only once cards are actually being played (2i.1). This row had no phase guard, so
          through the whole of selection and bidding it announced "Trick 1 of 5 — Tricks won:
          You 0, Old-Timer 0" before a single card existed — stating a trick was underway while
          the player was still being asked to pick a packet. `play` is the only phase where a
          trick number and a trick tally are both real; `dealer_exchange` knows trump but has
          not begun one. */}
      {view.phase === 'play' && (
        <div className="status-row">
          Trick {view.trickNumber + 1} of 5 — Tricks won: You {view.tricksWon[HUMAN]}, Old-Timer{' '}
          {view.tricksWon[BOT]}
        </div>
      )}
    </div>
  );
}
