import { useState } from 'react';
import { HelpPanel } from './HelpPanel.tsx';
import { isMuted, setMuted } from '../game/audioSettings.ts';
import { getRuleSettings } from '../game/ruleSettings.ts';

/** The in-game subset of Settings (direct user request: quit/save/restart reachable mid-game,
 *  not just from the title screen). Deliberately narrower than SettingsScreen — no rule
 *  TOGGLES here, since those only take effect on the next deal and an editable control that
 *  silently does nothing to the hand in progress would read as broken. The current values are
 *  still shown, read-only, with a pointer to where they're actually changed (design-critique
 *  feedback: a player who wants to flip a rule mid-session had no way to even discover Settings
 *  was where that lived). Sound and Help are genuinely safe to change/read at any moment, so
 *  they're the two settings duplicated here in full.
 *
 *  Deliberately does NOT include a past-tricks review. An earlier version did (a design-critique
 *  pass flagged the game as missing a way to review what's already been played), but real
 *  euchre doesn't let you flip back through the discard pile mid-hand — that IS the memory
 *  challenge this game is built around, and undoing it for convenience would have been the
 *  wrong trade for an experienced player (direct user feedback). The actually-authentic version
 *  of that same underlying complaint is `Table.tsx`'s winning-card highlight on the CURRENT,
 *  still-live trick — see that file.
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
  const [confirmingRestart, setConfirmingRestart] = useState(false);
  const rules = getRuleSettings();

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

        <p className="settings-note">
          Blind Hand Loner: {rules.blind_hand ? 'on' : 'off'}, Full Blind Loner:{' '}
          {rules.full_blind ? 'on' : 'off'}. Change these from Settings on the title screen,
          takes effect next game.
        </p>

        {confirmingRestart ? (
          <div className="pause-menu-actions">
            <p className="settings-note">Restarting gives up the hand you're on.</p>
            <button
              className="bid-button bid-button-danger"
              onClick={() => {
                onRestart();
                setConfirmingRestart(false);
              }}
            >
              Yes, restart
            </button>
            <button className="bid-button bid-button-back" onClick={() => setConfirmingRestart(false)}>
              Back
            </button>
          </div>
        ) : (
          <div className="pause-menu-actions">
            <button className="bid-button" onClick={onClose}>
              Resume
            </button>
            <button className="bid-button" onClick={() => setConfirmingRestart(true)}>
              Restart Game
            </button>
            <button className="bid-button bid-button-danger" onClick={onQuit}>
              Quit to Title
            </button>
          </div>
        )}

        <section className="settings-section">
          <h2>How to play</h2>
          <HelpPanel />
        </section>
      </div>
    </div>
  );
}
