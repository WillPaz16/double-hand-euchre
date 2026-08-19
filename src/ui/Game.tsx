import { useGame } from '../game/useGame.ts';
import { useSfx } from '../game/useSfx.ts';
import { SceneLayer } from './SceneLayer.tsx';
import { Scoreboard } from './Scoreboard.tsx';
import { StatusBanner } from './StatusBanner.tsx';
import { Table } from './Table.tsx';
import { BidPanel } from './BidPanel.tsx';
import { HandTray } from './HandTray.tsx';

export function Game() {
  const { view, legal, play } = useGame();
  useSfx(view);

  return (
    <>
      <SceneLayer />
      <div className="game-root">
      <Scoreboard view={view} />
      <StatusBanner view={view} />
      <Table view={view} />
      <BidPanel view={view} legal={legal} play={play} />
      <HandTray view={view} legal={legal} play={play} />
      </div>
    </>
  );
}
