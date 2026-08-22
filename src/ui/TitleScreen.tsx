import { useState } from 'react';
import { SceneLayer } from './SceneLayer.tsx';
import { isMuted, setMuted } from '../game/audioSettings.ts';

/** Title screen -> table (Phase 2 design spec §8's app flow). "Play a Friend" isn't built yet
 *  (Phase 3, multiplayer) so this only routes to Solo, but the screen itself — cabin scene,
 *  title, a way in — is the real thing, not a stub to replace later. Reuses `SceneLayer`
 *  as-is for the backdrop rather than a second bespoke background: it's the same room the
 *  game is played in, which is the point of a title screen that opens onto its own table. */
export function TitleScreen({ onPlay }: { onPlay: () => void }) {
  const [muted, setMutedState] = useState(isMuted());

  return (
    <>
      <SceneLayer />
      <div className="title-screen">
        <h1 className="title-heading">Two-Handed Euchre</h1>
        <p className="title-tagline">A cabin, a fire, and a hand you can only half-remember.</p>
        <button className="title-play-button" onClick={onPlay}>
          Play
        </button>
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
      </div>
    </>
  );
}
