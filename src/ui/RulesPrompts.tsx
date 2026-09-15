import { sameRules, type LonerRules, type RulesView } from '../../shared/net/protocol.ts';

const LABELS: Record<keyof LonerRules, string> = {
  blind_hand: 'Blind Hand Loner',
  full_blind: 'Full Blind Loner',
};
const KEYS = Object.keys(LABELS) as (keyof LonerRules)[];
const onOff = (v: boolean) => (v ? 'On' : 'Off');

/** Names only what would change — "turn Full Blind Loner on" — rather than restating every rule
 *  and leaving the reader to spot the difference. */
function describeChange(from: LonerRules, to: LonerRules): string {
  return KEYS.filter((k) => from[k] !== to[k])
    .map((k) => `turn ${LABELS[k]} ${onOff(to[k]).toLowerCase()}`)
    .join(' and ');
}

/** Before the first deal, when the two players' Settings disagree (direct user decision: ask
 *  both to agree rather than let either side's settings win).
 *
 *  Only the rules that actually differ are asked about. Each side's current pick starts as its
 *  own Settings, and the table deals the moment the two picks match — so agreeing with the
 *  other player is one click, and nobody re-presses a choice already shown as theirs. */
export function RulesAgreement({
  view,
  opponentName,
  onVote,
}: {
  view: RulesView;
  opponentName: string;
  onVote: (rules: LonerRules) => void;
}) {
  const mine = view.myVote ?? view.mine;
  const theirs = view.theirVote ?? view.theirs;
  if (!mine || !theirs) return null;
  // Asked about: anything the two players' OWN settings disagreed on, even after one of them
  // switches — the row stays so they can see what they agreed to and change it back.
  const differing = KEYS.filter((k) => view.mine?.[k] !== view.theirs?.[k]);

  return (
    <div className="net-overlay" role="dialog" aria-modal="true" aria-labelledby="rules-agree-title">
      <div className="net-overlay-card rules-card">
        <h2 id="rules-agree-title" className="rules-title">
          Pick the table's rules
        </h2>
        <p className="net-overlay-text">
          You and {opponentName} have different loner settings. Choose the same and the first
          hand deals.
        </p>
        {differing.map((key) => (
          <div key={key} className="rules-row">
            <div className="rules-row-label">{LABELS[key]}</div>
            <div className="rules-row-choices" role="group" aria-label={LABELS[key]}>
              {[true, false].map((value) => (
                <button
                  key={String(value)}
                  className="title-mute-toggle"
                  aria-pressed={mine[key] === value}
                  onClick={() => onVote({ ...mine, [key]: value })}
                >
                  {onOff(value)}
                </button>
              ))}
            </div>
            <div className="rules-row-theirs">
              {opponentName} wants {onOff(theirs[key])}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mid-game: the other player proposed a rule change for the next hand. Play does not stop —
 *  this sits above the table until answered. Direct user feedback: "in multiplayer when a rule
 *  change is made, you must check with the opponent." */
export function RulesProposal({
  view,
  opponentName,
  onVote,
}: {
  view: RulesView;
  opponentName: string;
  onVote: (rules: LonerRules) => void;
}) {
  const next = view.next ?? view.inEffect;
  const proposal = view.theirVote;
  // Only an open question: they asked for something different, and I have not answered.
  if (!view.locked || !proposal || sameRules(proposal, next) || view.myVote) return null;

  return (
    <div className="rules-proposal" role="alertdialog" aria-labelledby="rules-proposal-text">
      <p id="rules-proposal-text">
        {opponentName} wants to {describeChange(next, proposal)}, starting next hand.
      </p>
      <div className="rules-proposal-actions">
        <button className="bid-button" onClick={() => onVote(proposal)}>
          Agree
        </button>
        <button className="bid-button bid-button-back" onClick={() => onVote(next)}>
          Keep current
        </button>
      </div>
    </div>
  );
}
