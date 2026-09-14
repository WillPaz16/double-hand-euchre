/** Player-facing rules summary, shared by SettingsScreen (title screen) and PauseMenu
 *  (in-game) so the copy exists in exactly one place. Deliberately NOT a reuse of RULES.md's
 *  text — that file is the engineering spec (§ numbers, "Default (v1)", references to
 *  `legalActions`) and reads that way on purpose; this is the condensed, plain-language
 *  version for someone learning the game mid-session.
 *
 *  Kept SHORT on purpose. This was four dense paragraphs and filled most of the settings
 *  screen; nobody reads a wall of text to start a card game, and anything that needs more than
 *  a line is better learned by playing a hand. */
export function HelpPanel() {
  return (
    <div className="help-panel">
      <section className="help-section">
        <h3>The idea</h3>
        <p>You play both hands, one at a time. Remember what's in the one you're not looking at.</p>
      </section>
      <section className="help-section">
        <h3>Your hands</h3>
        <p>Two hands of five, face down. Pick one. The other stays blind until later.</p>
      </section>
      <section className="help-section">
        <h3>Going alone</h3>
        <p>
          Sit your blind hand out for extra points. Two rarer calls let you commit earlier, with
          less to go on. Toggle them in Settings.
        </p>
      </section>
      <section className="help-section">
        <h3>Scoring</h3>
        <p>3 or 4 tricks: 1 point. All 5: 2, more alone. Under 3 and you're euchred, they take 2. Race to 10.</p>
      </section>
    </div>
  );
}
