import { useEffect, useRef } from 'react';
import type { PlayerView } from '../../shared/engine/types.ts';
import { isMuted } from './audioSettings.ts';

const SOUND_FILES = {
  cardPlay: '/audio/card_play.wav',
  trickWin: '/audio/trick_win.wav',
  euchre: '/audio/euchre_fanfare.wav',
  gameWin: '/audio/game_win_fanfare.wav',
  shuffle: '/audio/shuffle.wav',
} as const;

type SoundName = keyof typeof SOUND_FILES;

/** One HTMLAudioElement per sound, reused and rewound rather than recreated — cheap and lets
 *  a sound retrigger mid-playback (e.g. two quick trick wins) without overlap glitches. */
function useSoundBank() {
  const bankRef = useRef<Record<SoundName, HTMLAudioElement> | null>(null);
  if (!bankRef.current) {
    const bank = {} as Record<SoundName, HTMLAudioElement>;
    for (const [name, src] of Object.entries(SOUND_FILES)) {
      const audio = new Audio(src);
      audio.volume = 0.5;
      bank[name as SoundName] = audio;
    }
    bankRef.current = bank;
  }
  return bankRef.current;
}

function play(bank: Record<SoundName, HTMLAudioElement>, name: SoundName) {
  if (isMuted()) return;
  const audio = bank[name];
  audio.currentTime = 0;
  // Autoplay can reject before the player's first interaction (e.g. a very early bot move on
  // page load); that's fine to ignore — it's not a real error, just a policy no-op.
  audio.play().catch(() => {});
}

/** Watches the redacted view for the moments worth a sound: a card landing, a trick won, a
 *  euchre, the game won, and the shuffle at the top of a new deal. No new engine state — every
 *  trigger is derived from a `view` transition, the same pattern as useOpponentExpression. */
/** `view` is nullable because the ONLINE client has no state until the server's first sync
 *  lands — there is simply nothing to make a sound about yet. Every read below is guarded
 *  rather than the hook being called conditionally, which the rules of hooks forbid. */
export function useSfx(view: PlayerView | null): void {
  const bank = useSoundBank();
  const prev = useRef({
    trickCardCount: view?.currentTrick.length ?? 0,
    tricksWon: view ? view.tricksWon.A + view.tricksWon.B : 0,
    phase: view?.phase ?? null,
  });

  useEffect(() => {
    if (!view) return;
    const p = prev.current;

    if (view.currentTrick.length > p.trickCardCount) {
      play(bank, 'cardPlay');
    }

    const tricksWonTotal = view.tricksWon.A + view.tricksWon.B;
    if (tricksWonTotal > p.tricksWon) {
      play(bank, 'trickWin');
    }

    if (view.phase !== p.phase) {
      if (view.phase === 'game_over') {
        play(bank, 'gameWin');
      } else if (view.phase === 'hand_complete' && view.maker) {
        const makerTricks = view.tricksWon[view.maker];
        if (makerTricks < 3) play(bank, 'euchre'); // the maker's side was euchred
      } else if (view.phase === 'select') {
        play(bank, 'shuffle');
      }
    }

    prev.current = { trickCardCount: view.currentTrick.length, tricksWon: tricksWonTotal, phase: view.phase };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.currentTrick.length, view?.tricksWon.A, view?.tricksWon.B, view?.phase]);
}
