import { useEffect, useRef, useState } from 'react';
import { SceneLayer } from './SceneLayer.tsx';
import { loadSavedGame } from '../game/savedGame.ts';

/** Title screen -> table (Phase 2 design spec §8's app flow). Reuses `SceneLayer` as-is for the
 *  backdrop rather than a second bespoke background: it's the same room the game is played in,
 *  which is the point of a title screen that opens onto its own table.
 *
 *  The title and menu are drawn as OBJECTS in that room — a nailed-up plank sign and a stack of
 *  pixel-cornered plates — rather than text floating over a darkened smudge. A solid object is
 *  legible over any scenery at any viewport, so nothing behind it has to be collision-checked. */
export function TitleScreen({
  onPlay,
  onContinue,
  onSettings,
  onPlayFriend,
}: {
  onPlay: () => void;
  onContinue: () => void;
  onSettings: () => void;
  onPlayFriend: () => void;
}) {
  // A finished game isn't "in progress" — Continue resuming straight into a game-over screen
  // would read as broken, so a game_over save doesn't count here. Play still clears it either
  // way (see App.tsx), so it's never stuck on screen.
  const saved = loadSavedGame();
  const canContinue = saved !== null && saved.phase !== 'game_over';
  // "New Game" over an in-progress save silently discarded it with one click and no way back
  // (design-critique feedback). Only needs a confirm step when there's actually something at
  // stake — a fresh save-less title screen's "Play" stays a single tap.
  const [confirmingNewGame, setConfirmingNewGame] = useState(false);
  // The button a keyboard user pressed unmounts when the menu swaps, which would drop focus to
  // <body>. Hand it to Back on the way in, and back to New Game on the way out.
  const newGameRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const swapped = useRef(false);
  useEffect(() => {
    if (!swapped.current) return;
    (confirmingNewGame ? backRef : newGameRef).current?.focus();
  }, [confirmingNewGame]);
  const swap = (next: boolean) => {
    swapped.current = true;
    setConfirmingNewGame(next);
  };

  return (
    // `.title-scene` scopes the CSS overrides in index.css that retune SceneLayer for this
    // screen's composition rather than the in-game table's — see the "Title screen scene
    // overrides" block there. SettingsScreen shares `.title-scene`; `.title-scene-landing` is
    // for the retuning only this screen's sign needs (painting, clock, picture).
    <div className="title-scene title-scene-landing">
      <SceneLayer />
      <div className="title-screen title-landing">
        <header className="title-sign">
          {/* Not "Two-Handed Euchre": that is the established name of a different game — two
              players, ONE hand each (see Wikipedia's "Euchre variants"). Here each player plays
              both hands of a partnership, so "double-hand". The two pips flanking it are that
              idea drawn: a red hand and a black hand. The tagline is the user's own line. */}
          {/* Both words at ONE size (direct owner feedback: "the font and scale of the word
              euchre is far larger" — "Double-Hand" was a small kicker and barely read). The
              pips moved to flank EUCHRE: it is the shorter line, so they balance the two widths. */}
          <h1 className="title-sign-heading">
            <span className="title-sign-word">Double-Hand</span>{' '}
            <span className="title-sign-word">
              <span className="title-pip title-pip-hearts" aria-hidden="true" />
              Euchre
              <span className="title-pip title-pip-spades" aria-hidden="true" />
            </span>
          </h1>
          <p className="title-sign-tagline">
            The euchre you know and love, but you only have one friend.
          </p>
        </header>
        {confirmingNewGame ? (
          <div className="title-menu title-menu-confirm" role="group" aria-labelledby="title-confirm-note">
            <p id="title-confirm-note" className="title-confirm-note">
              Starting a new game gives up the one in progress.
            </p>
            <button className="title-plate title-plate-ember" onClick={onPlay}>
              Yes, start over
            </button>
            <button ref={backRef} className="title-plate" onClick={() => swap(false)}>
              Back
            </button>
          </div>
        ) : (
          <div className="title-menu">
            {canContinue && (
              <button className="title-plate title-plate-gold" onClick={onContinue}>
                Continue
              </button>
            )}
            <button
              ref={newGameRef}
              className={canContinue ? 'title-plate' : 'title-plate title-plate-gold'}
              onClick={canContinue ? () => swap(true) : onPlay}
            >
              {canContinue ? 'New Game' : 'Play'}
            </button>
            <button className="title-plate" onClick={onPlayFriend}>
              Play a Friend
            </button>
            <button className="title-plate title-plate-quiet" onClick={onSettings}>
              <span className="title-gear" aria-hidden="true" />
              Settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
