import { useState } from 'react';
import { Game } from './ui/Game.tsx';
import { TitleScreen } from './ui/TitleScreen.tsx';
import { SettingsScreen } from './ui/SettingsScreen.tsx';
import { clearSavedGame } from './game/savedGame.ts';

type View = 'title' | 'settings' | 'game';

export function App() {
  // `Game` calls `useGame()`, which starts a fresh deal the moment it mounts — so the title
  // screen has to keep `Game` UNMOUNTED, not just visually hidden behind it, or "Play" would
  // always be resuming a deal that silently started at page load rather than beginning one.
  const [view, setView] = useState<View>('title');

  if (view === 'settings') {
    return <SettingsScreen onBack={() => setView('title')} />;
  }
  if (view === 'game') {
    return <Game onQuit={() => setView('title')} />;
  }
  return (
    <TitleScreen
      // "Play" always starts fresh, even over an in-progress save — `useGame` otherwise
      // resumes any save it finds on mount, so a leftover one has to be cleared here first.
      // "Continue" leaves it in place and lets that same resume-on-mount pick it up.
      onPlay={() => {
        clearSavedGame();
        setView('game');
      }}
      onContinue={() => setView('game')}
      onSettings={() => setView('settings')}
    />
  );
}
