import { useState } from 'react';
import { SceneLayer } from './SceneLayer.tsx';
import { loadSavedGame } from '../game/savedGame.ts';

/** Title screen -> table (Phase 2 design spec §8's app flow). "Play a Friend" isn't built yet
 *  (Phase 3, multiplayer) so this only routes to Solo, but the screen itself — cabin scene,
 *  title, a way in — is the real thing, not a stub to replace later. Reuses `SceneLayer`
 *  as-is for the backdrop rather than a second bespoke background: it's the same room the
 *  game is played in, which is the point of a title screen that opens onto its own table. */
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

  return (
    // `.title-scene` scopes the CSS overrides in index.css that retune SceneLayer for this
    // screen's centered-text composition rather than the in-game table's — see the "Title
    // screen scene overrides" block there. Game.tsx's own <SceneLayer> has no such ancestor,
    // so the in-game room is untouched by any of it.
    <div className="title-scene">
      <SceneLayer />
      <div className="title-screen">
        {/* Not "Two-Handed Euchre": that is the established name of a different game — two
            players, ONE hand each (see Wikipedia's "Euchre variants"). Here each player plays
            both hands of a partnership, so "double-hand". The tagline is the user's own line. */}
        <h1 className="title-heading">Double-Hand Euchre</h1>
        <p className="title-tagline">The euchre you know and love, but you only have one friend.</p>
        {confirmingNewGame ? (
          <>
            <p className="settings-note">Starting a new game gives up the one in progress.</p>
            <button className="title-play-button" onClick={onPlay}>
              Yes, start over
            </button>
            <button className="title-mute-toggle" onClick={() => setConfirmingNewGame(false)}>
              Back
            </button>
          </>
        ) : (
          <>
            {canContinue && (
              <button className="title-play-button" onClick={onContinue}>
                Continue
              </button>
            )}
            <button
              className="title-play-button"
              onClick={canContinue ? () => setConfirmingNewGame(true) : onPlay}
            >
              {canContinue ? 'New Game' : 'Play'}
            </button>
            <button className="title-play-button" onClick={onPlayFriend}>
              Play a Friend
            </button>
            <div className="title-footer-row">
              <button className="title-mute-toggle" onClick={onSettings}>
                Settings
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
