import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_CONFIG,
  newGame,
  nextDeal,
  reduce,
  legalActions,
  redact,
  actingHand,
  trickWinnerIndex,
} from '../../shared/engine/index.ts';
import type {
  Action,
  CompletedTrick,
  Config,
  GameState,
  Player,
  TrickCard,
} from '../../shared/engine/types.ts';
import { chooseMove } from '../../shared/bot/index.ts';
import { getRuleSettings } from './ruleSettings.ts';
import { loadSavedGame, saveGame } from './savedGame.ts';

export const HUMAN: Player = 'A';
export const BOT: Player = 'B';

/** How long the Old-Timer appears to think before moving.
 *
 *  A single fixed number was the tell that he isn't one: every card, every bid, at exactly the
 *  same beat, is a metronome rather than a person. So the delay is drawn from a range, and
 *  leans longer when he actually has something to weigh — a forced play (one legal card) comes
 *  back quickly, a real choice takes a moment.
 *
 *  `BOT_DELAY_MAX_MS` is exported because the timing tests have to advance fake timers far
 *  enough to guarantee he has moved. They used to hardcode 700ms against a 600ms constant —
 *  i.e. they silently kept a copy of this delay's upper bound. */
const BOT_DELAY_MIN_MS = 450;
const BOT_DELAY_JITTER_MS = 250;
/** Added when the choice is a real one rather than a forced move. */
const BOT_DELAY_PONDER_MS = 200;
export const BOT_DELAY_MAX_MS = BOT_DELAY_MIN_MS + BOT_DELAY_JITTER_MS + BOT_DELAY_PONDER_MS;

function botDelay(legalCount: number): number {
  const ponder = legalCount > 1 ? BOT_DELAY_PONDER_MS : 0;
  return BOT_DELAY_MIN_MS + Math.random() * BOT_DELAY_JITTER_MS + ponder;
}

const NEXT_DEAL_DELAY_MS = 1500;

/** The beats of a completed trick, in order. One source for all three, because this hook
 *  decides how long the trick stays on screen and Table.tsx animates against the same numbers —
 *  two halves of one piece of choreography that used to be hardcoded in both files and kept in
 *  step by a comment in each:
 *
 *      pop     0 .. 500ms      the winning card swells and settles
 *      sweep 620 .. 1240ms     every card slides off toward the winner's side
 *      state clears at 1320ms  (TRICK_HOLD_MS)
 *
 *  If the hold ends before the sweep finishes, cards pop out mid-flight; if it ends much later
 *  they sit invisible at the swept-away end state (the sweep ends at opacity 0 with fill-mode
 *  `both`) while play stays frozen. Both were observed while tuning this, which is why the
 *  total is derived rather than typed in. */
export const TRICK_POP_MS = 500;
export const TRICK_HOLD_BEFORE_SWEEP_MS = 620;
export const TRICK_SWEEP_MS = 620;
/** A breath of slack after the sweep lands, so the next card never starts while the last one is
 *  still visibly leaving. */
const TRICK_SETTLE_MS = 80;
export const TRICK_HOLD_MS = TRICK_HOLD_BEFORE_SWEEP_MS + TRICK_SWEEP_MS + TRICK_SETTLE_MS;

/** Re-exported, not redeclared: this moved to shared types once the SERVER had to produce it
 *  too (a networked client cannot rebuild a completed trick from the state it receives — see
 *  the type's own docstring). Kept exported from here so existing importers don't have to care
 *  where it lives. */
export type { CompletedTrick };

function freshSeed(): string {
  return `deal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Builds a fresh Config from DEFAULT_CONFIG plus whatever rule toggles are saved in
 *  localStorage (see ruleSettings.ts) — the settings screen only ever writes to that store,
 *  it never touches a live GameState, so every new deal picks up the latest toggle here. */
function buildConfig(): Config {
  return { ...DEFAULT_CONFIG, lonerTiersEnabled: getRuleSettings() };
}

/** Drives a full local single-player game: holds engine state, auto-plays the bot's turns
 *  on a short delay, and auto-advances to the next deal once a hand settles. The human's
 *  moves are validated against legalActions() before being applied — the UI cannot submit
 *  an illegal action even if a component bug tries to. */
export function useGame(initialSeed?: string) {
  // `initialSeed` exists so tests get a deterministic deal. Without it these tests are flaky
  // by construction: which player wins a given trick decides whether the human even HAS a
  // legal move during the sweep hold, and that is precisely the condition the freeze and
  // deadlock tests depend on. Consistent with the engine's design rather than a test-only
  // hack — the whole engine is seeded for reproducibility (§4), and a replay/debug view would
  // need exactly this hook. Note only the FIRST hand is deterministic; nextDeal draws fresh.
  // A saved game only ever resumes real play, never a test — tests always pass `initialSeed`
  // for determinism, and resuming a leftover localStorage save would make that seed a lie.
  const [state, setState] = useState<GameState>(() => {
    if (initialSeed === undefined) {
      const saved = loadSavedGame();
      if (saved) return saved;
      return newGame(freshSeed(), HUMAN, buildConfig());
    }
    // Seeded (test) path: never touches localStorage, so it stays deterministic regardless
    // of whatever settings a real session may have saved.
    return newGame(initialSeed, HUMAN, DEFAULT_CONFIG);
  });
  const [completedTrick, setCompletedTrick] = useState<CompletedTrick | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSweepRef = useRef<CompletedTrick | null>(null);
  // The bot's most recently chosen action — presentation only (drives useOpponentSpeech's
  // reaction to a pass/order-up/trump call), never read by the reducer. `PLAY_CARD` actions
  // are excluded: this exists to react to BIDDING moments specifically (direct user feedback:
  // "i want the old man to say pass when they pass, pick it up when he calls trump"), and
  // every play-phase card already gets its own visual — it lands on the felt.
  const [lastBotAction, setLastBotAction] = useState<Action | null>(null);

  // Continuous autosave (direct user request: closing the tab or hitting Quit should never
  // lose progress). Same seed guard as the resume-on-mount above, for the same reason.
  useEffect(() => {
    if (initialSeed === undefined) saveGame(state);
  }, [state, initialSeed]);

  /** Applies an action and, if it completed a trick, captures that trick for the UI.
   *
   *  This exists because of a real gap between the engine and the screen: `reduce()` appends
   *  the final card and clears `currentTrick` to [] within the SAME call, so a full trick
   *  never exists in committed state and React never renders it. Measured in-browser, the
   *  trick area went 0,1,2,3 → 0 — meaning the card that actually WON the trick was never
   *  visible to the player. That is a playability bug, not just missing polish.
   *
   *  The engine is right and is left alone (its behaviour is what the 40 tests pin down);
   *  reconstructing the completed trick is the UI's job. */
  const applyAction = useCallback((s: GameState, action: Action): GameState => {
    const next = reduce(s, action);
    if (action.type === 'PLAY_CARD' && next.trickNumber > s.trickNumber && s.trump) {
      const hand = actingHand(s);
      if (hand) {
        const cards: TrickCard[] = [...s.currentTrick, { handId: hand, card: action.card }];
        pendingSweepRef.current = {
          cards,
          winner: next.tricksWon[HUMAN] > s.tricksWon[HUMAN] ? HUMAN : BOT,
          winningIndex: trickWinnerIndex(cards, s.trump),
        };
      }
    }
    return next;
  }, []);

  // Promote a captured trick into state. Kept out of the setState updater (which must stay
  // pure) by staging it in a ref first.
  useEffect(() => {
    if (!pendingSweepRef.current) return;
    setCompletedTrick(pendingSweepRef.current);
    pendingSweepRef.current = null;
  }, [state]);

  /** Clear the held trick after the hold — keyed on `completedTrick`, NOT on `state`.
   *
   *  This split fixes a hard deadlock. Both halves used to live in one effect keyed on
   *  [state], so the cleanup ran on any state change: a human click landing during the hold
   *  changed `state`, which cleared the very timeout that was going to release the freeze.
   *  The re-run then hit `if (!pendingSweepRef.current) return` and never set a new timer, so
   *  `completedTrick` stayed non-null forever, the bot effect early-returned forever, and the
   *  game was permanently unplayable after ONE mistimed click. Reproduced before this fix:
   *  after clicking during a hold, `playable=0, stillSweeping=4` with no recovery.
   *
   *  Keying the timer on the thing it clears means its lifetime can no longer be cut short by
   *  an unrelated state change. A timer whose cleanup is driven by different state than the
   *  value it resets is the general shape of this bug. */
  useEffect(() => {
    if (!completedTrick) return;
    const t = setTimeout(() => setCompletedTrick(null), TRICK_HOLD_MS);
    return () => clearTimeout(t);
  }, [completedTrick]);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // Freeze play while a finished trick is on the table, so the next card cannot land on
    // top of one the player is still reading.
    if (completedTrick) return;

    if (state.phase === 'hand_complete' || state.phase === 'misdeal') {
      timerRef.current = setTimeout(() => {
        // Rules are re-read between hands (direct user feedback: blind loners "can be switched
        // on at any time during a game for the next round"). Between hands is the only safe
        // moment: mid-hand, changing which loner tiers exist would change what a bid already
        // made could mean. Seeded (test) games keep their fixed config, same as `restart`.
        setState((s) =>
          nextDeal(initialSeed === undefined ? { ...s, config: buildConfig() } : s, freshSeed()),
        );
      }, NEXT_DEAL_DELAY_MS);
      return;
    }

    if (state.phase === 'game_over') return;

    const botLegal = legalActions(state, BOT);
    if (botLegal.length > 0) {
      timerRef.current = setTimeout(() => {
        setState((s) => {
          const legal = legalActions(s, BOT);
          if (legal.length === 0) return s; // a human move raced ahead of this timer
          const view = redact(s, BOT);
          const action = chooseMove(view, legal);
          if (action.type !== 'PLAY_CARD') setLastBotAction(action);
          return applyAction(s, action);
        });
      }, botDelay(botLegal.length));
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state, completedTrick, applyAction]);

  /** The freeze was previously applied ONLY to the bot's effect, even though the intent was
   *  "play freezes while a finished trick is on the table". The human path had no guard at
   *  all, which is what let a click during the hold reach setState and trigger the deadlock
   *  above. Guarding here is both the correctness fix and the behaviour that was intended;
   *  `frozen` is also returned so the UI can disable the cards rather than silently swallow
   *  a click the player thinks landed. */
  const play = useCallback(
    (action: Action) => {
      if (completedTrick) return;
      setState((s) => {
        const legal = legalActions(s, HUMAN);
        const isLegal = legal.some((a) => JSON.stringify(a) === JSON.stringify(action));
        if (!isLegal) {
          console.warn('rejected illegal human action', action);
          return s;
        }
        return applyAction(s, action);
      });
    },
    [applyAction, completedTrick],
  );

  /** Starts a fresh game. Without this, reaching `game_over` left the app with no way
   *  forward at all — `newGame` was only ever called at mount, so finishing a game meant
   *  reloading the page to play another. Found by actually playing one to 10. */
  const restart = useCallback(() => {
    setCompletedTrick(null);
    pendingSweepRef.current = null;
    setLastBotAction(null);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // Same determinism boundary as the mount initializer above: a seeded (test) restart must
    // stay config-fixed rather than reading whatever a real session happens to have saved.
    const config = initialSeed === undefined ? buildConfig() : DEFAULT_CONFIG;
    setState(newGame(freshSeed(), HUMAN, config));
  }, [initialSeed]);

  return {
    restart,
    view: redact(state, HUMAN),
    legal: legalActions(state, HUMAN),
    play,
    completedTrick,
    frozen: completedTrick !== null,
    lastBotAction,
  };
}
