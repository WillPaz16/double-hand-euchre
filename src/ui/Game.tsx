import { useState } from 'react';
import { useGame } from '../game/useGame.ts';
import { useSfx } from '../game/useSfx.ts';
import { SceneLayer } from './SceneLayer.tsx';
import { Scoreboard } from './Scoreboard.tsx';
import { StatusBanner } from './StatusBanner.tsx';
import { Table } from './Table.tsx';
import { BidPanel } from './BidPanel.tsx';
import { HandTray } from './HandTray.tsx';
import { LonerDim, LonerStamp } from './LonerFx.tsx';
import { PauseMenu } from './PauseMenu.tsx';

export function Game({ onQuit }: { onQuit: () => void }) {
  const { view, legal, play, completedTrick, frozen, restart, quit } = useGame();
  useSfx(view);
  const [paused, setPaused] = useState(false);

  return (
    <>
      <SceneLayer />
      {/* Sits above the scene but below the game content (z-index between SceneLayer's -1
          and #root's 1) — it dims the room and the wall, never the table or the cards, which
          must stay perfectly readable regardless of which loner tier is in play. */}
      <LonerDim view={view} />
      <LonerStamp view={view} />
      <div className="game-root">
      <button
        className="game-pause-button"
        aria-label="Pause menu"
        onClick={() => setPaused(true)}
      >
        ⚙
      </button>
      <Scoreboard view={view} />
      <StatusBanner view={view} onRestart={restart} />
      <Table view={view} completedTrick={completedTrick} />
      <div className="action-bar">
        <BidPanel view={view} legal={legal} play={play} />
        <HandTray view={view} legal={legal} play={play} frozen={frozen} />
      </div>
      </div>
      {paused && (
        <PauseMenu
          onClose={() => setPaused(false)}
          onRestart={() => {
            restart();
            setPaused(false);
          }}
          onQuit={() => {
            quit();
            onQuit();
          }}
        />
      )}
    </>
  );
}
