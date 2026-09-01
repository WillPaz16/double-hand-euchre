import { useState } from 'react';
import { HelpPanel } from './HelpPanel.tsx';
import { isMuted, setMuted } from '../game/audioSettings.ts';

/** The in-game subset of Settings (direct user request: quit/save/restart reachable mid-game,
 *  not just from the title screen). Deliberately narrower than SettingsScreen — no rule
 *  toggles here, since those only take effect on the next deal and showing an editable control
 *  that silently does nothing to the hand in progress would read as broken. Sound and Help are
 *  genuinely safe to change/read at any moment, so they're the two settings duplicated here.
 *
 *  Save itself needs no button: `useGame` autosaves after every move, so "Quit" is really
 *  "stop showing me this game", not "discard progress" — the saved copy is what Title
 *  screen's Continue button reads back. */
export function PauseMenu({
  onClose,
  onRestart,
  onQuit,
}: {
  onClose: () => void;
  onRestart: () => void;
  onQuit: () => void;
}) {
  const [muted, setMutedState] = useState(isMuted());

  return (
    <div className="pause-menu-backdrop" role="dialog" aria-modal="true" aria-label="Paused">
      <div className="pause-menu">
        <h2 className="settings-heading">Paused</h2>

        <button
          className="title-mute-toggle"
          aria-pressed={!muted}
          onClick={() => {
            const next = !muted;
            setMuted(next);
            setMutedState(next);
          }}
        >
          {muted ? 'Sound: Off' : 'Sound: On'}
        </button>

        <div className="pause-menu-actions">
          <button className="bid-button" onClick={onClose}>
            Resume
          </button>
          <button className="bid-button" onClick={onRestart}>
            Restart Game
          </button>
          <button className="bid-button bid-button-danger" onClick={onQuit}>
            Quit to Title
          </button>
        </div>

        <section className="settings-section">
          <h2>How to play</h2>
          <HelpPanel />
        </section>
      </div>
    </div>
  );
}
