import { createContext, useContext, type ReactNode } from 'react';
import { DEFAULT_AVATAR, type AvatarKey } from '../../shared/net/avatars.ts';

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

/** Which character the opponent chose. Same default reasoning as the name: single-player is
 *  the Old-Timer and always was, so solo renders no provider and nothing changes. */
const OpponentAvatarContext = createContext<AvatarKey>(DEFAULT_AVATAR);

export function OpponentIdentityProvider({
  name,
  avatar,
  children,
}: {
  name: string;
  avatar: AvatarKey;
  children: ReactNode;
}) {
  return (
    <OpponentNameContext.Provider value={name}>
      <OpponentAvatarContext.Provider value={avatar}>{children}</OpponentAvatarContext.Provider>
    </OpponentNameContext.Provider>
  );
}

export function useOpponentAvatar(): AvatarKey {
  return useContext(OpponentAvatarContext);
}

export function useOpponentName(): string {
  return useContext(OpponentNameContext);
}
