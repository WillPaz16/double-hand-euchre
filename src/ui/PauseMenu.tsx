import { useState } from 'react';
import { HelpPanel } from './HelpPanel.tsx';
import { isMuted, setMuted } from '../game/audioSettings.ts';
import { LonerRuleToggles, type OnlineRulesControl } from './LonerRuleToggles.tsx';
import { getSoloOpponent, setSoloOpponent } from '../game/opponentSettings.ts';
import { AVATAR_KEYS, AVATAR_LABELS, avatarSrc, type AvatarKey } from '../../shared/net/avatars.ts';

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
  onOpponentChange,
  onlineRules,
}: {
  onClose: () => void;
  onRestart: () => void;
  onQuit: () => void;
  /** Applies immediately, mid-hand. Unlike the rule toggles, which cannot change under a game
   *  already dealt, who is sitting across from you is pure presentation — no engine state
   *  depends on it, so there is no reason to make someone finish a hand to swap a face. */
  onOpponentChange?: (key: AvatarKey) => void;
  /** Present in an online game, where changing a rule needs the other player to agree. */
  onlineRules?: OnlineRulesControl;
}) {
  const [muted, setMutedState] = useState(isMuted());
  const [confirmingRestart, setConfirmingRestart] = useState(false);
  const [opponent, setOpponent] = useState<AvatarKey>(getSoloOpponent);

  return (
    <div className="pause-menu-backdrop" role="dialog" aria-modal="true" aria-label="Paused">
      <div className="pause-menu">
        <h2 className="settings-heading">Paused</h2>

        <div className="avatar-row">
          {AVATAR_KEYS.map((key) => (
            <label
              key={key}
              className={`avatar-option${key === opponent ? ' is-chosen' : ''}`}
              title={AVATAR_LABELS[key]}
            >
              <input
                type="radio"
                name="pause-opponent"
                value={key}
                checked={key === opponent}
                onChange={() => {
                  setOpponent(key);
                  setSoloOpponent(key);
                  onOpponentChange?.(key);
                }}
              />
              <img src={avatarSrc(key, 'idle')} alt={AVATAR_LABELS[key]} />
            </label>
          ))}
        </div>

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

        <LonerRuleToggles online={onlineRules} />

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
            {/* Not styled as danger: quitting keeps the game saved, so red would warn about a
                loss that does not happen. */}
            <button className="bid-button" onClick={onQuit}>
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
