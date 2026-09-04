import { createContext, useContext, type ReactNode } from 'react';

/** What to call the player across the table.
 *
 *  In single-player that is the Old-Timer, a specific character with a face, a pipe and a set of
 *  catchphrases — naming him is part of the game. Online it is another person, and calling them
 *  "Old-Timer" reads as a bug: the scoreboard labels their score with a stranger's name, and the
 *  banner announces "Old-Timer wins the game" when a human just beat you.
 *
 *  Context rather than props because the name is needed in six components at four different
 *  depths (scoreboard, banner, bid prompt, hand tray, table title, dealer chip) and is pure
 *  presentation — threading it through every intermediate signature would touch far more code,
 *  and every existing test that renders those components in isolation, for the sake of a string.
 *
 *  The DEFAULT is deliberately 'Old-Timer': single-player renders no provider at all and keeps
 *  its character, and every existing component test keeps passing untouched. Only the online
 *  screen wraps a provider. */
const OpponentNameContext = createContext<string>('Old-Timer');

export function OpponentNameProvider({ name, children }: { name: string; children: ReactNode }) {
  return <OpponentNameContext.Provider value={name}>{children}</OpponentNameContext.Provider>;
}

export function useOpponentName(): string {
  return useContext(OpponentNameContext);
}
