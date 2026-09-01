import { useState } from 'react';
import { SceneLayer } from './SceneLayer.tsx';
import { isMuted, setMuted } from '../game/audioSettings.ts';
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
}: {
  onPlay: () => void;
  onContinue: () => void;
  onSettings: () => void;
}) {
  const [muted, setMutedState] = useState(isMuted());
  // A finished game isn't "in progress" — Continue resuming straight into a game-over screen
  // would read as broken, so a game_over save doesn't count here. Play still clears it either
  // way (see App.tsx), so it's never stuck on screen.
  const saved = loadSavedGame();
  const canContinue = saved !== null && saved.phase !== 'game_over';

  return (
    // `.title-scene` scopes the CSS overrides in index.css that retune SceneLayer for this
    // screen's centered-text composition rather than the in-game table's — see the "Title
    // screen scene overrides" block there. Game.tsx's own <SceneLayer> has no such ancestor,
    // so the in-game room is untouched by any of it.
    <div className="title-scene">
      <SceneLayer />
      <div className="title-screen">
        <h1 className="title-heading">Two-Handed Euchre</h1>
        <p className="title-tagline">A cabin, a fire, and a hand you can only half-remember.</p>
        {canContinue && (
          <button className="title-play-button" onClick={onContinue}>
            Continue
          </button>
        )}
        <button className="title-play-button" onClick={onPlay}>
          {canContinue ? 'New Game' : 'Play'}
        </button>
        <div className="title-footer-row">
          <button
            className="title-mute-toggle"
            // "Pressed" = sound is the engaged/active state, matching what the visible label
            // already says ("Sound: On"/"Off") — a screen reader user gets the same fact a
            // sighted player reads off the label, instead of a toggle with no reported state
            // at all (the default for a plain <button>, which carries no on/off semantics).
            aria-pressed={!muted}
            onClick={() => {
              const next = !muted;
              setMuted(next);
              setMutedState(next);
            }}
          >
            {muted ? 'Sound: Off' : 'Sound: On'}
          </button>
          <button className="title-mute-toggle" onClick={onSettings}>
            Settings
          </button>
        </div>
      </div>
    </div>
  );
}
