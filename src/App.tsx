import { useState } from 'react';
import { Game } from './ui/Game.tsx';
import { TitleScreen } from './ui/TitleScreen.tsx';
import { SettingsScreen } from './ui/SettingsScreen.tsx';
import { LobbyScreen } from './ui/LobbyScreen.tsx';
import { OnlineGame } from './ui/OnlineGame.tsx';
import type { RoomCode } from '../shared/net/protocol.ts';
import { clearSavedGame } from './game/savedGame.ts';

type View = 'title' | 'settings' | 'game' | 'lobby' | 'online';

export function App() {
  // `Game` calls `useGame()`, which starts a fresh deal the moment it mounts — so the title
  // screen has to keep `Game` UNMOUNTED, not just visually hidden behind it, or "Play" would
  // always be resuming a deal that silently started at page load rather than beginning one.
  const [view, setView] = useState<View>('title');
  // Held here rather than inside OnlineGame so the component fully unmounts (and its socket
  // closes) whenever the code changes or the player leaves.
  const [roomCode, setRoomCode] = useState<RoomCode | null>(null);

  if (view === 'settings') {
    return <SettingsScreen onBack={() => setView('title')} />;
  }
  if (view === 'game') {
    return <Game onQuit={() => setView('title')} />;
  }
  if (view === 'lobby') {
    return (
      <LobbyScreen
        onJoin={(code) => {
          setRoomCode(code);
          setView('online');
        }}
        onBack={() => setView('title')}
      />
    );
  }
  if (view === 'online' && roomCode) {
    return (
      <OnlineGame
        code={roomCode}
        onLeave={() => {
          setRoomCode(null);
          setView('title');
        }}
      />
    );
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
      onPlayFriend={() => setView('lobby')}
      onSettings={() => setView('settings')}
    />
  );
}
