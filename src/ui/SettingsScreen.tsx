import { useState } from 'react';
import { SceneLayer } from './SceneLayer.tsx';
import { HelpPanel } from './HelpPanel.tsx';
import { isMuted, setMuted } from '../game/audioSettings.ts';
import { getRuleSettings, setRuleSettings, type RuleSettings } from '../game/ruleSettings.ts';
import { getSoloOpponent, setSoloOpponent } from '../game/opponentSettings.ts';
import { AVATAR_KEYS, AVATAR_LABELS, avatarSrc, type AvatarKey } from '../../shared/net/avatars.ts';

/** Reached from the title screen only (not mid-game — see PauseMenu for the in-game subset).
 *  Rule toggles here only ever write to localStorage; a game already in progress reads its
 *  config once at deal-start (`useGame`'s `buildConfig()`) and isn't affected until the next
 *  one, so there's no mid-hand "the rules just changed under me" case to handle.
 *
 *  The "framework to add more settings later" ask isn't a registry/plugin abstraction — it's
 *  this: one localStorage-backed module per concern (audioSettings.ts, ruleSettings.ts) and
 *  one section per concept here. A new toggle is a new field on RuleSettings (or a new sibling
 *  module) plus a new <section>, not a new mechanism. */
export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const [muted, setMutedState] = useState(isMuted());
  const [rules, setRules] = useState<RuleSettings>(getRuleSettings());
  const [opponent, setOpponent] = useState<AvatarKey>(getSoloOpponent);

  function toggleRule(key: keyof RuleSettings) {
    const next = { ...rules, [key]: !rules[key] };
    setRules(next);
    setRuleSettings(next);
  }

  return (
    <div className="title-scene">
      <SceneLayer />
      <div className="settings-screen">
        <h1 className="settings-heading">Settings</h1>

        {/* Who you play against in single-player. Distinct from the character you SHOW an
            online opponent, which is picked in the lobby — one is who sits across from you,
            the other is who they see. Takes effect at the next game, like the rule toggles. */}
        <section className="settings-section">
          <h2>Your opponent</h2>
          <div className="avatar-row">
            {AVATAR_KEYS.map((key) => (
              <label
                key={key}
                className={`avatar-option${key === opponent ? ' is-chosen' : ''}`}
                title={AVATAR_LABELS[key]}
              >
                <input
                  type="radio"
                  name="solo-opponent"
                  value={key}
                  checked={key === opponent}
                  onChange={() => {
                    setOpponent(key);
                    setSoloOpponent(key);
                  }}
                />
                <img src={avatarSrc(key, 'idle')} alt={AVATAR_LABELS[key]} />
              </label>
            ))}
          </div>
          <p className="settings-note">{AVATAR_LABELS[opponent]} deals you in next game.</p>
        </section>

        <section className="settings-section">
          <h2>Sound</h2>
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
        </section>

        <section className="settings-section">
          <h2>Loner rules</h2>
          <p className="settings-note">
            Regular going-alone during bidding always stays on, that's just euchre. These two
            are our own add-on, so turn either off if you'd rather keep it standard. Won't
            touch the game you're in, only the next one you start.
          </p>
          <div className="settings-toggle-row">
            <button
              className="title-mute-toggle"
              aria-pressed={rules.blind_hand}
              onClick={() => toggleRule('blind_hand')}
            >
              Blind Hand Loner: {rules.blind_hand ? 'On' : 'Off'}
            </button>
            <button
              className="title-mute-toggle"
              aria-pressed={rules.full_blind}
              onClick={() => toggleRule('full_blind')}
            >
              Full Blind Loner: {rules.full_blind ? 'On' : 'Off'}
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h2>How to play</h2>
          <HelpPanel />
        </section>

        <button className="title-play-button" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}
