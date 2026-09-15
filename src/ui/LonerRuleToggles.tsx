import { useState } from 'react';
import { getRuleSettings, setRuleSettings } from '../game/ruleSettings.ts';
import { sameRules, type LonerRules, type RulesView } from '../../shared/net/protocol.ts';

const LABELS: Record<keyof LonerRules, string> = {
  blind_hand: 'Blind Hand Loner',
  full_blind: 'Full Blind Loner',
};

export interface OnlineRulesControl {
  view: RulesView;
  opponentName: string;
  onVote: (rules: LonerRules) => void;
}

/** The two blind-loner toggles, usable mid-game (direct user feedback: they "can be switched on
 *  at any time during a game for the next round").
 *
 *  Solo, a toggle is just your setting, and the game picks it up at the next deal.
 *
 *  Online, the other player has to agree, so the SAME buttons express a proposal instead. They
 *  show the rules the next hand will use, or your own pending proposal if you have one, so the
 *  button state always answers "what did I ask for?". */
export function LonerRuleToggles({ online }: { online?: OnlineRulesControl }) {
  const [solo, setSolo] = useState<LonerRules>(getRuleSettings());

  const next = online ? (online.view.next ?? online.view.inEffect) : solo;
  const shown = online?.view.myVote ?? next;

  const toggle = (key: keyof LonerRules) => {
    const changed = { ...shown, [key]: !shown[key] };
    if (online) {
      online.onVote(changed);
    } else {
      setSolo(changed);
      setRuleSettings(changed);
    }
  };

  let note = 'Changes start with the next hand.';
  if (online) {
    const { view, opponentName } = online;
    if (view.myVote && !sameRules(view.myVote, next)) {
      note = `Waiting for ${opponentName} to agree. If they do, it starts next hand.`;
    } else if (view.next) {
      note = 'Agreed. These rules start with the next hand.';
    } else {
      note = `${opponentName} has to agree to a change. It starts with the next hand.`;
    }
  }

  return (
    <div className="loner-rule-toggles">
      <div className="settings-toggle-row">
        {(Object.keys(LABELS) as (keyof LonerRules)[]).map((key) => (
          <button
            key={key}
            className="title-mute-toggle"
            aria-pressed={shown[key]}
            onClick={() => toggle(key)}
          >
            {LABELS[key]}: {shown[key] ? 'On' : 'Off'}
          </button>
        ))}
      </div>
      <p className="settings-note">{note}</p>
    </div>
  );
}
