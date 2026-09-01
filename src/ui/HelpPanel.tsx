/** Player-facing rules summary, shared by SettingsScreen (title screen) and PauseMenu
 *  (in-game) so the copy exists in exactly one place. Deliberately NOT a reuse of RULES.md's
 *  text — that file is the engineering spec (§ numbers, "Default (v1)", references to
 *  `legalActions`) and reads that way on purpose; this is the condensed, plain-language
 *  version for someone learning the game mid-session. */
export function HelpPanel() {
  return (
    <div className="help-panel">
      <section className="help-section">
        <h3>The idea</h3>
        <p>
          You control two hands at once, playing them alternately. Each round you see one hand
          at a time and have to remember what's in the other — that's the whole twist on
          standard euchre.
        </p>
      </section>
      <section className="help-section">
        <h3>Picking your hand</h3>
        <p>
          You're dealt two packets of 5 cards, face-down. Pick one to be your selected hand —
          the other becomes your blind hand, unseen until later.
        </p>
      </section>
      <section className="help-section">
        <h3>Going alone</h3>
        <p>
          Normally you can go alone when you name trump, sitting out your blind hand for extra
          points if you sweep all 5 tricks. Two rarer variants let you commit earlier, with
          less information, for a bigger payout: a blind-hand loner (trump is known, your hand
          isn't) and a full-blind loner (nothing is known yet). Both can be turned off in
          Settings if you'd rather stick to standard euchre.
        </p>
      </section>
      <section className="help-section">
        <h3>Scoring</h3>
        <p>
          Take 3 or 4 tricks: 1 point. Sweep all 5: 2 points (more if you went alone). Fail to
          take 3 tricks and you're euchred — the other side scores 2. First to 10 wins.
        </p>
      </section>
    </div>
  );
}
