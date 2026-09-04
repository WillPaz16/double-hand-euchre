import { useState } from 'react';
import { useOnlineGame } from '../net/useOnlineGame.ts';
import { useSfx } from '../game/useSfx.ts';
import { SceneLayer } from './SceneLayer.tsx';
import { Scoreboard } from './Scoreboard.tsx';
import { StatusBanner } from './StatusBanner.tsx';
import { Table } from './Table.tsx';
import { BidPanel } from './BidPanel.tsx';
import { HandTray } from './HandTray.tsx';
import { LonerDim, LonerStamp } from './LonerFx.tsx';
import { PauseMenu } from './PauseMenu.tsx';
import type { RoomCode } from '../../shared/net/protocol.ts';

/** The same board as single-player, driven by the server instead of a local reducer.
 *
 *  Kept as a sibling of `Game` rather than a mode flag inside it: the two differ in what they
 *  can offer (there is no "restart" you can take unilaterally when someone else is sitting
 *  across the table) and in what has to be on screen (a room code, a connection state, an
 *  opponent who may have walked away). Folding both into one component would mean a growing
 *  pile of `if (online)` inside a screen that is otherwise about cards. */
export function OnlineGame({ code, onLeave }: { code: RoomCode; onLeave: () => void }) {
  const game = useOnlineGame(code);
  const [paused, setPaused] = useState(false);

  // Hooks must run unconditionally, so the sound hook is given a view or nothing and the
  // early return below happens after it.
  useSfx(game.view);

  const waiting =
    !game.view || game.status !== 'connected' || !game.opponentPresent;

  return (
    <>
      <SceneLayer />
      {game.view && <LonerDim view={game.view} />}
      {game.view && <LonerStamp view={game.view} />}

      <div className="game-root">
        <button className="game-pause-button" aria-label="Pause menu" onClick={() => setPaused(true)}>
          <img className="game-pause-gear" src="/art/gear.png" alt="" />
        </button>

        {game.view && <Scoreboard view={game.view} />}
        {game.view && <StatusBanner view={game.view} onRestart={() => undefined} />}
        {game.view && (
          <Table view={game.view} completedTrick={game.completedTrick} lastBotAction={null} />
        )}
        <div className="action-bar">
          {game.view && <BidPanel view={game.view} legal={game.legal} play={game.play} />}
          {game.view && (
            <HandTray
              view={game.view}
              legal={game.legal}
              play={game.play}
              frozen={game.frozen}
            />
          )}
        </div>
      </div>

      {waiting && (
        <div className="net-overlay" role="status" aria-live="polite">
          <div className="net-overlay-card">
            <p className="net-overlay-code">{code}</p>
            <p className="net-overlay-text">{describe(game.status, game.opponentPresent)}</p>
            {game.notice && <p className="net-overlay-notice">{game.notice}</p>}
            <button className="bid-button" onClick={() => { game.leave(); onLeave(); }}>
              Leave
            </button>
          </div>
        </div>
      )}

      {paused && (
        <PauseMenu
          onClose={() => setPaused(false)}
          // No unilateral restart online — see this component's own docstring.
          onRestart={() => setPaused(false)}
          onQuit={() => {
            game.leave();
            onLeave();
          }}
        />
      )}
    </>
  );
}

function describe(status: string, opponentPresent: boolean): string {
  if (status === 'refused') return 'That table is already full.';
  if (status === 'reconnecting') return 'Lost the connection. Trying to get back...';
  if (status === 'connecting') return 'Connecting...';
  if (!opponentPresent) return 'Waiting for the other player. Read them this code.';
  return 'Ready.';
}
