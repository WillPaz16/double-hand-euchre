import { useState } from 'react';
import { useGame } from '../game/useGame.ts';
import { useSfx } from '../game/useSfx.ts';
import { SceneLayer } from './SceneLayer.tsx';
import { Scoreboard } from './Scoreboard.tsx';
import { StatusBanner } from './StatusBanner.tsx';
import { OpponentIdentityProvider } from './opponentIdentity.tsx';
import { getSoloOpponent } from '../game/opponentSettings.ts';
import { AVATAR_NAMES } from '../../shared/net/avatars.ts';
import { Table } from './Table.tsx';
import { BidPanel } from './BidPanel.tsx';
import { HandTray } from './HandTray.tsx';
import { LonerDim, LonerStamp } from './LonerFx.tsx';
import { PauseMenu } from './PauseMenu.tsx';

export function Game({ onQuit }: { onQuit: () => void }) {
  const { view, legal, play, completedTrick, frozen, restart, quit, lastBotAction } = useGame();
  useSfx(view);
  const [paused, setPaused] = useState(false);
  // Seeded from the stored choice, then LIVE: the pause menu can swap it mid-hand. Unlike the
  // rule toggles, which a dealt game cannot honour without changing the rules underneath it,
  // the opponent's face is pure presentation — nothing in the engine knows or cares who it is,
  // so there is no reason to make someone finish a hand before they can change it.
  const [opponent, setOpponent] = useState(getSoloOpponent);

  return (
    <OpponentIdentityProvider name={AVATAR_NAMES[opponent]} avatar={opponent}>
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
        {/* The generated brass cog, not the `⚙` glyph this used to render — that was the one
            piece of art in the game coming from the system font, so it changed shape per
            platform and matched nothing around it. `alt=""` because the button already carries
            its own aria-label; naming the image too would announce it twice. */}
        <img className="game-pause-gear" src="/art/gear.png" alt="" />
      </button>
      <Scoreboard view={view} />
      <StatusBanner view={view} onRestart={restart} />
      <Table view={view} completedTrick={completedTrick} lastBotAction={lastBotAction} />
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
          onOpponentChange={setOpponent}
          onQuit={() => {
            quit();
            onQuit();
          }}
        />
      )}
    </OpponentIdentityProvider>
  );
}
