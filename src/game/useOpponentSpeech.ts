import { useEffect, useRef, useState } from 'react';
import type { Action, PlayerView, Suit } from '../../shared/engine/types.ts';
import { otherPlayer } from '../../shared/engine/legal.ts';

const SPEECH_MS = 2800;

const SUIT_WORD: Record<Suit, string> = {
  clubs: 'clubs',
  diamonds: 'diamonds',
  hearts: 'hearts',
  spades: 'spades',
};

/** Direct user feedback: "i want the old man to say pass when they pass, pick it up when he
 *  calls trump. also old man should say like other funny things periodically, or after a good
 *  hand... brainstorm what an old man would say." Every list below is a POOL, not a script —
 *  `pick()` draws from one at random and avoids repeating the immediately previous line, so the
 *  same event doesn't say the identical sentence twice in a row over a long session. */
const PASS_LINES = ['Pass.', "Not this one.", "I'll sit this one out.", 'Nothing doing.', "Ehh, pass."];
const ORDER_UP_LINES = ["I'll pick it up.", "That'll do just fine.", "I'll take that."];
const ALONE_ORDER_UP_LINES = ["I'll pick it up — and I don't need you for this one.", "My hand, my way."];
const NAME_TRUMP_LINES = (suit: Suit) => [
  `We'll go with ${SUIT_WORD[suit]}.`,
  `${SUIT_WORD[suit][0]!.toUpperCase()}${SUIT_WORD[suit].slice(1)}, then.`,
  `Let's make it ${SUIT_WORD[suit]}.`,
];
const ALONE_NAME_TRUMP_LINES = (suit: Suit) => [
  `${SUIT_WORD[suit][0]!.toUpperCase()}${SUIT_WORD[suit].slice(1)} — and I'll go it alone.`,
  `Don't need a partner for ${SUIT_WORD[suit]}.`,
];

const HAND_WIN_LINES = [
  'Heh. Not bad, old man.',
  "That's how it's done.",
  'Still got it.',
  "Wow, you're good — for a beginner.",
];
const HAND_LOSE_LINES = [
  "Beginner's luck.",
  "Well, I'll be.",
  'You got me that time.',
  'Hmph. Lucky draw.',
];
const GAME_WIN_LINES = [
  "That's ten. Good game, kid.",
  "Game's mine. Maybe next time.",
  'Old dog, a few tricks left yet.',
];
const GAME_LOSE_LINES = [
  "I'm too old for this.",
  'Alright, alright. You earned that one.',
  "Don't let it go to your head.",
];
/** Not on a raw timer — a genuine wall-clock idle line risks firing mid-bid or mid-trick, a
 *  worse moment than saying nothing. Tied instead to the one truly idle beat every hand
 *  already has: the deal, before either packet is picked (Table.tsx's own NO_HAND_PHASES —
 *  nothing is at stake yet, so a line landing here can't step on anything. */
const IDLE_BANTER_LINES = [
  "Cards don't lie, kid.",
  'Your deal, or was it mine?',
  "This chair's older than you.",
  'Back in my day we played for real stakes.',
  "Deal 'em.",
];

function pick(pool: string[], avoid: string | null): string {
  if (pool.length === 1) return pool[0]!;
  const options = avoid ? pool.filter((p) => p !== avoid) : pool;
  return options[Math.floor(Math.random() * options.length)]!;
}

/** Derives a speech-bubble line for the Old-Timer from bidding actions and hand/game outcomes.
 *  Purely presentational, same determinism boundary as `useOpponentExpression`'s blink timer —
 *  `Math.random()` never reaches the reducer, only which of several equivalent flavor lines
 *  shows. `lastBotAction` comes from useGame.ts, since a PASS/ORDER_UP/NAME_TRUMP is otherwise
 *  invisible in the redacted `PlayerView` (a pass changes no visible field at all in some
 *  turns) — the action itself, not a state diff, is the only reliable signal. */
export function useOpponentSpeech(
  view: PlayerView,
  lastBotAction: Action | null,
  /** False when the opponent is another PERSON. Every line in this file is the Old-Timer's
   *  voice, so putting them in a stranger's mouth is worse than saying nothing: online, "Mai"
   *  was delivering "This chair's older than you."
   *
   *  Passing `lastBotAction: null` was not enough and that is the whole bug. It suppresses the
   *  bid REACTIONS, which read it directly, but the phase-driven effect below never looked at
   *  it — idle banter fires on `select` at 25%, hand reactions at 45%, and the game-over line
   *  always. It survived this long because it is probabilistic: a short session usually shows
   *  nothing at all.
   *
   *  Expressions are deliberately NOT gated on this. A face that looks pleased when they take
   *  a trick reads as a person; canned dialogue reads as a bot. */
  botOpponent: boolean = true,
): string | null {
  const [line, setLine] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLineRef = useRef<string | null>(null);
  const prevPhaseRef = useRef(view.phase);

  const say = (text: string) => {
    setLine(text);
    lastLineRef.current = text;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setLine(null), SPEECH_MS);
  };

  useEffect(() => {
    if (!botOpponent || !lastBotAction) return;
    if (lastBotAction.type === 'PASS') say(pick(PASS_LINES, lastLineRef.current));
    else if (lastBotAction.type === 'ORDER_UP') {
      say(pick(lastBotAction.loner ? ALONE_ORDER_UP_LINES : ORDER_UP_LINES, lastLineRef.current));
    } else if (lastBotAction.type === 'NAME_TRUMP') {
      const pool = lastBotAction.loner
        ? ALONE_NAME_TRUMP_LINES(lastBotAction.suit)
        : NAME_TRUMP_LINES(lastBotAction.suit);
      say(pick(pool, lastLineRef.current));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastBotAction, botOpponent]);

  useEffect(() => {
    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = view.phase;
    if (prevPhase === view.phase) return;
    if (!botOpponent) return;

    if (view.phase === 'hand_complete' || view.phase === 'game_over') {
      const botWon = view.winner ? view.winner === otherPlayer(view.you) : view.tricksWon[otherPlayer(view.you)] > view.tricksWon[view.you];
      if (view.phase === 'game_over') {
        // The game's own outcome only happens once — always worth a line.
        say(pick(botWon ? GAME_WIN_LINES : GAME_LOSE_LINES, lastLineRef.current));
      } else if (Math.random() < 0.45) {
        // A hand-level reaction every time would talk over the player constantly — "after a
        // good hand" reads as occasional commentary, not a running commentary track.
        say(pick(botWon ? HAND_WIN_LINES : HAND_LOSE_LINES, lastLineRef.current));
      }
    } else if (view.phase === 'select' && Math.random() < 0.25) {
      say(pick(IDLE_BANTER_LINES, lastLineRef.current));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.phase, botOpponent]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return line;
}
