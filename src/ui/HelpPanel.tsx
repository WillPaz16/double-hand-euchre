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
          You're playing both sides of the table. Two hands, one at a time, and you've got to
          keep track of what's in the one you're not looking at. That's the whole game.
        </p>
      </section>
      <section className="help-section">
        <h3>Picking your hand</h3>
        <p>
          You get two packets of five, face down, no peeking. Pick one to play. The other stays
          blind until later in the hand.
        </p>
      </section>
      <section className="help-section">
        <h3>Going alone</h3>
        <p>
          You can go alone the moment you name trump, sitting your blind hand out for extra
          points if you run the table. Two rarer calls let you commit even earlier, with even
          less to go on: blind, before the upcard's even turned, or right after it turns but
          before you've looked at your own hand. Bigger risk, bigger score. Turn either off in
          Settings if that's not your speed.
        </p>
      </section>
      <section className="help-section">
        <h3>Scoring</h3>
        <p>
          Win 3 or 4 tricks, that's a point. Sweep all five for two, more if you went alone.
          Come up short of 3 and you're euchred, the other side takes 2. Race to 10.
        </p>
      </section>
    </div>
  );
}
