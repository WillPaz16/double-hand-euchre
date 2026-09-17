import { useEffect, useState } from 'react';
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
import { OpponentIdentityProvider } from './opponentIdentity.tsx';
import { ChatPanel } from './ChatPanel.tsx';
import { RulesAgreement, RulesProposal } from './RulesPrompts.tsx';
import { CopyLinkButton } from './CopyLinkButton.tsx';
import type { ChatMessage } from '../../shared/net/protocol.ts';

/** How long a chat line stays in the speech bubble: long enough to read what was said. */
function bubbleMs(text: string): number {
  return Math.min(8000, 2500 + text.length * 60);
}

/** Phases where nobody is expected to act — the table is between moves on its own. */
const SETTLING = new Set(['hand_complete', 'misdeal', 'game_over']);

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

  // The other player's newest LIVE line, held in their speech bubble for a reading beat.
  const [bubble, setBubble] = useState<ChatMessage | null>(null);
  useEffect(() => {
    const line = game.liveChat;
    if (!line || line.from === game.seat) return;
    setBubble(line);
    const t = setTimeout(() => setBubble(null), bubbleMs(line.text));
    return () => clearTimeout(t);
  }, [game.liveChat, game.seat]);

  // Direct user feedback: tell the proposer when their rule change was turned down, rather than
  // letting their toggles quietly snap back.
  const [declinedNotice, setDeclinedNotice] = useState(false);
  useEffect(() => {
    if (game.rulesDeclined === 0) return;
    setDeclinedNotice(true);
    const t = setTimeout(() => setDeclinedNotice(false), 4000);
    return () => clearTimeout(t);
  }, [game.rulesDeclined]);

  // Direct user feedback: multiplayer needs "a waiting for player... when you are waiting".
  // Solo never needed one — the bot answers in under a second — but a person can take a while,
  // and an action bar that simply goes empty reads as the game having stalled.
  const theirMove =
    !!game.view &&
    !waiting &&
    !!game.rules?.locked &&
    !game.frozen &&
    game.legal.length === 0 &&
    !SETTLING.has(game.view.phase);

  // Falls back to a neutral word rather than to the Old-Timer: the player across the table is
  // a person, and if they gave no name "Opponent" is honest where a character's name is not.
  const opponentLabel = game.opponentName ?? 'Opponent';

  return (
    <OpponentIdentityProvider name={opponentLabel} avatar={game.opponentAvatar}>
      <SceneLayer />
      {game.view && <LonerDim view={game.view} />}
      {game.view && <LonerStamp view={game.view} />}

      <div className="game-root">
        <button className="game-pause-button" aria-label="Pause menu" onClick={() => setPaused(true)}>
          <img className="game-pause-gear" src="/art/gear.png" alt="" />
        </button>

        {game.view && <Scoreboard view={game.view} />}
        {/* A real handler, not the `() => undefined` that used to sit here: the button rendered,
            accepted the click, and did nothing. A rematch takes both players — see
            `requestRematch` in room.ts. */}
        {game.view && (
          <StatusBanner
            view={game.view}
            onRestart={game.requestRematch}
            rematch={game.rematch}
          />
        )}
        {game.view && (
          <Table
            view={game.view}
            completedTrick={game.completedTrick}
            lastBotAction={null}
            botOpponent={false}
            chatBubble={bubble}
          />
        )}
        {game.rules && !waiting && (
          <RulesProposal view={game.rules} opponentName={opponentLabel} onVote={game.voteRules} />
        )}
        {declinedNotice && !waiting && (
          <div className="rules-proposal rules-toast" role="status" aria-live="polite">
            {opponentLabel} kept the current rules.
          </div>
        )}
        <div className="action-bar">
          {theirMove && (
            <div className="waiting-on" role="status" aria-live="polite">
              {/* Exact wording on direct user request ("lets do Waiting for Opponent..."). */}
              Waiting for Opponent
              <span className="waiting-dots" aria-hidden="true" />
            </div>
          )}
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

      {!waiting && game.rules && !game.rules.locked && (
        <RulesAgreement view={game.rules} opponentName={opponentLabel} onVote={game.voteRules} />
      )}

      {game.seat && (
        <ChatPanel
          chat={game.chat}
          you={game.seat}
          opponentName={opponentLabel}
          onSend={game.sendChat}
        />
      )}

      {waiting && (
        <div className="net-overlay" role="status" aria-live="polite">
          <div className="net-overlay-card">
            <p className="net-overlay-code">{code}</p>
            <p className="net-overlay-text">{describe(game.status, game.opponentPresent)}</p>
            {game.notice && <p className="net-overlay-notice">{game.notice}</p>}
            {/* Only while waiting for someone to arrive — once both seats are filled there is
                nobody left to invite. */}
            {!game.opponentPresent && <CopyLinkButton code={code} />}
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
          onlineRules={
            game.rules
              ? { view: game.rules, opponentName: opponentLabel, onVote: game.voteRules }
              : undefined
          }
          onQuit={() => {
            game.leave();
            onLeave();
          }}
        />
      )}
    </OpponentIdentityProvider>
  );
}

function describe(status: string, opponentPresent: boolean): string {
  if (status === 'refused') return 'That table is already full.';
  if (status === 'replaced') return 'This game is open in another tab or on another device.';
  if (status === 'reconnecting') return 'Lost the connection. Trying to get back...';
  if (status === 'connecting') return 'Connecting...';
  if (!opponentPresent) return 'Waiting for the other player. Read them this code.';
  return 'Ready.';
}