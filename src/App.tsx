import { useState } from 'react';
import { Game } from './ui/Game.tsx';
import { TitleScreen } from './ui/TitleScreen.tsx';

export function App() {
  // `Game` calls `useGame()`, which starts a fresh deal the moment it mounts — so the title
  // screen has to keep `Game` UNMOUNTED, not just visually hidden behind it, or "Play" would
  // always be resuming a deal that silently started at page load rather than beginning one.
  const [started, setStarted] = useState(false);
  return started ? <Game /> : <TitleScreen onPlay={() => setStarted(true)} />;
}
