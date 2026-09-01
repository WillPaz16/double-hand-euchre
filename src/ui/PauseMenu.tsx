import { useState } from 'react';
import { HelpPanel } from './HelpPanel.tsx';
import { isMuted, setMuted } from '../game/audioSettings.ts';
import { getRuleSettings } from '../game/ruleSettings.ts';
import { HUMAN, type CompletedTrick } from '../game/useGame.ts';
import type { Card } from '../../shared/engine/types.ts';

const SUIT_SYMBOL: Record<Card['suit'], string> = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
};

function cardText(card: Card): string {
  return `${card.rank}${SUIT_SYMBOL[card.suit]}`;
}

/** The in-game subset of Settings (direct user request: quit/save/restart reachable mid-game,
 *  not just from the title screen). Deliberately narrower than SettingsScreen — no rule
 *  TOGGLES here, since those only take effect on the next deal and an editable control that
 *  silently does nothing to the hand in progress would read as broken. The current values are
 *  still shown, read-only, with a pointer to where they're actually changed (design-critique
 *  feedback: a player who wants to flip a rule mid-session had no way to even discover Settings
 *  was where that lived). Sound and Help are genuinely safe to change/read at any moment, so
 *  they're the two settings duplicated here in full.
 *
 *  Save itself needs no button: `useGame` autosaves after every move, so "Quit" is really
 *  "stop showing me this game", not "discard progress" — the saved copy is what Title
 *  screen's Continue button reads back. */
export function PauseMenu({
  trickLog,
  onClose,
  onRestart,
  onQuit,
}: {
  trickLog: CompletedTrick[];
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

        {trickLog.length > 0 && (
          <section className="settings-section">
            <h2>Tricks so far</h2>
            <ol className="trick-log">
              {trickLog.map((trick, i) => (
                <li key={i}>
                  {trick.cards.map((tc) => cardText(tc.card)).join('  ')} — won by{' '}
                  {trick.winner === HUMAN ? 'you' : 'Old-Timer'}
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="settings-section">
          <h2>How to play</h2>
          <HelpPanel />
        </section>
      </div>
    </div>
  );
}
