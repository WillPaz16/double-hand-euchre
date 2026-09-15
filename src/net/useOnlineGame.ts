import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action, CompletedTrick, Player, PlayerView } from '../../shared/engine/types.ts';
import type { ClientMessage, RoomCode, ServerMessage } from '../../shared/net/protocol.ts';
import { DEFAULT_AVATAR, type AvatarKey } from '../../shared/net/avatars.ts';
import { getClientId } from './clientId.ts';
import { getPlayerAvatar, getPlayerName } from './playerName.ts';
import { TRICK_HOLD_MS } from '../game/useGame.ts';

/** Where the authoritative server lives. SAME ORIGIN by default.
 *
 *  In production one Fly machine serves both this bundle and the WebSocket, so the correct
 *  URL is always this page's own host with the matching scheme. Deriving it rather than baking
 *  it means a production build has nothing to configure and therefore nothing to get wrong:
 *  the scheme follows the page's own (`wss:` on https), so the mixed-content failure the guard
 *  below exists for cannot be reached by forgetting a build variable — which is exactly how it
 *  used to be reached.
 *
 *  `VITE_SERVER_URL` still overrides, and `.env.development` sets it to `ws://localhost:8787`:
 *  in dev the client is on Vite's :5173 and the server on :8787, which are NOT the same origin.
 *  The `localhost:8787` fallback below is only for a non-browser context (tests, SSR) where
 *  there is no page origin to derive from. */
function sameOriginUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost:8787';
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${window.location.host}`;
}

const SERVER_URL: string = import.meta.env.VITE_SERVER_URL ?? sameOriginUrl();

/** True when this build cannot possibly reach its server, which is worth saying out loud.
 *
 *  This can no longer happen by OMITTING `VITE_SERVER_URL` — the default is same-origin and
 *  therefore always scheme-correct. It can still happen by SETTING it wrong: a build that
 *  hard-codes a `ws://` URL and is then served over https. A browser refuses a plaintext
 *  `ws://` socket from an https page outright as mixed content, so the failure is not even a
 *  timeout — the socket dies instantly and the reconnect loop retries forever behind "Lost the
 *  connection", which blames the network for a build mistake.
 *
 *  Checked at module load rather than per connection: it is a property of the build and the
 *  page, and it cannot change while the page is open. */
const MISCONFIGURED =
  typeof window !== 'undefined' &&
  window.location.protocol === 'https:' &&
  SERVER_URL.startsWith('ws://');

/** Backoff between reconnect attempts. Capped so a server that is down does not become a tight
 *  retry loop, but the first retry is quick because the overwhelmingly common case is a brief
 *  network blip, not an outage. */
const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 8000;

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'refused';

export interface OnlineGame {
  /** Null until the first sync arrives — the caller must not render a table without it. */
  view: PlayerView | null;
  legal: Action[];
  play: (action: Action) => void;
  completedTrick: CompletedTrick | null;
  frozen: boolean;
  seat: Player | null;
  code: RoomCode;
  opponentPresent: boolean;
  /** What to call the other player. Null until they arrive or if they gave no name. */
  opponentName: string | null;
  /** Which character to draw across the table. */
  opponentAvatar: AvatarKey;
  status: ConnectionStatus;
  /** Set when the server refused something worth showing the player. */
  notice: string | null;
  leave: () => void;
}

/** Connects to a room and mirrors the server's authoritative state.
 *
 *  This hook holds NO game rules and never calls the engine. Everything it renders — the view,
 *  which moves are playable, whether a trick just ended — is what the server said, because the
 *  server is the only thing that can be right about a game two people are playing. That is also
 *  why there is no optimistic update: a euchre turn is one tap and then a wait, so predicting
 *  the result locally would buy nothing and could briefly show a card the server then rejects.
 */
export function useOnlineGame(code: RoomCode): OnlineGame {
  const [view, setView] = useState<PlayerView | null>(null);
  const [legal, setLegal] = useState<Action[]>([]);
  const [seat, setSeat] = useState<Player | null>(null);
  const [opponentPresent, setOpponentPresent] = useState(false);
  const [opponentName, setOpponentName] = useState<string | null>(null);
  const [opponentAvatar, setOpponentAvatar] = useState<AvatarKey>(DEFAULT_AVATAR);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [notice, setNotice] = useState<string | null>(null);
  const [completedTrick, setCompletedTrick] = useState<CompletedTrick | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  /** Set only by `leave()`. Distinct from the per-connection `cancelled` flag below: this one
   *  has to outlive a single effect run because it expresses the PLAYER's intent, not React's. */
  const leftRef = useRef(false);
  /** Read inside socket callbacks, which close over the render that created them. */
  const seatRef = useRef<Player | null>(null);

  useEffect(() => {
    seatRef.current = seat;
  }, [seat]);

  /** Holds a finished trick on screen briefly, exactly as the single-player hook does — the
   *  server has already moved on, so without this the winning card would be drawn and swept in
   *  the same frame. Keyed on the trick itself so an unrelated re-render cannot cut it short. */
  useEffect(() => {
    if (!completedTrick) return;
    const t = setTimeout(() => setCompletedTrick(null), TRICK_HOLD_MS);
    return () => clearTimeout(t);
  }, [completedTrick]);

  useEffect(() => {
    // `cancelled`, `refused`, `retry` and `timer` are LOCAL to this effect run, not refs.
    //
    // They were refs first, and StrictMode caught it immediately: React deliberately mounts,
    // unmounts and remounts effects in development, so cleanup closed socket #1 while the
    // remount reset the shared flag to false. Socket #1's `onclose` then fired, saw a
    // not-cancelled flag, and scheduled a reconnect for a connection nobody wanted — the UI sat
    // in "Lost the connection" forever while a healthy socket #2 was already talking to the
    // server. A per-connection lifecycle needs per-connection state; a ref is shared across all
    // of them and is exactly the wrong tool.
    if (MISCONFIGURED) {
      // Terminal, and said plainly. Retrying cannot help: the browser will refuse every
      // attempt for the same reason, and an endless "reconnecting" is a worse answer than the
      // truth.
      setStatus('refused');
      setNotice(
        `This build cannot reach its game server: it was built with VITE_SERVER_URL set to ` +
          `an insecure ws:// address (${SERVER_URL}), which a browser refuses from an https ` +
          `page. Single-player still works.`,
      );
      return;
    }

    let cancelled = false;
    let refused = false;
    let retry = RECONNECT_MIN_MS;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let socket: WebSocket | null = null;

    leftRef.current = false;
    setStatus('connecting');

    const connect = () => {
      if (cancelled || refused || leftRef.current) return;
      const self = new WebSocket(SERVER_URL);
      socket = self;
      socketRef.current = self;

      self.onopen = () => {
        if (cancelled) return;
        retry = RECONNECT_MIN_MS;
        setStatus('connected');
        const hello: ClientMessage = {
          t: 'hello',
          code,
          clientId: getClientId(),
          ...(getPlayerName() ? { name: getPlayerName()! } : {}),
          avatar: getPlayerAvatar(),
        };
        self.send(JSON.stringify(hello));
      };

      self.onmessage = (event) => {
        if (cancelled) return;
        let msg: ServerMessage;
        try {
          msg = JSON.parse(String(event.data)) as ServerMessage;
        } catch {
          return;
        }
        if (msg.t === 'seated') {
          setSeat(msg.seat);
          seatRef.current = msg.seat;
          setNotice(null);
          return;
        }
        if (msg.t === 'sync') {
          setView(msg.view);
          setLegal(msg.legal);
          setOpponentPresent(msg.opponentPresent);
          setOpponentName(msg.opponentName);
          setOpponentAvatar(msg.opponentAvatar);
          if (msg.completedTrick) setCompletedTrick(msg.completedTrick);
          return;
        }
        // msg.t === 'rejected'
        setNotice(msg.reason);
        // Being refused a SEAT is terminal; being refused a MOVE is not. Only the former can
        // arrive before we have been seated, which is what distinguishes them here.
        if (!seatRef.current) {
          refused = true;
          setStatus('refused');
          self.close();
        }
      };

      self.onclose = () => {
        if (cancelled || refused || leftRef.current) return;
        setStatus('reconnecting');
        timer = setTimeout(connect, retry);
        retry = Math.min(retry * 2, RECONNECT_MAX_MS);
      };

      // `onerror` is always followed by `onclose`, so the retry is scheduled there rather than
      // in both places, which would double the reconnect rate.
      self.onerror = () => self.close();
    };

    connect();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      socket?.close();
    };
  }, [code]);

  const play = useCallback((action: Action) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setNotice('Not connected.');
      return;
    }
    const msg: ClientMessage = { t: 'action', action };
    socket.send(JSON.stringify(msg));
  }, []);

  const leave = useCallback(() => {
    leftRef.current = true;
    socketRef.current?.close();
  }, []);

  return {
    view,
    // The server is the authority on playability, but it does not know this client is still
    // showing a finished trick. Suppressing moves during the hold matches the single-player
    // freeze and stops a card landing on top of one the player is mid-read.
    legal: completedTrick ? [] : legal,
    play,
    completedTrick,
    frozen: completedTrick !== null,
    seat,
    code,
    opponentPresent,
    opponentName,
    opponentAvatar,
    status,
    notice,
    leave,
  };
}
