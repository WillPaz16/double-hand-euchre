import { describe, it, expect } from 'vitest';
import { createRoom, join, requestRematch, rematchViewFor } from '../shared/net/room.ts';
import { DEFAULT_CONFIG } from '../shared/engine/index.ts';
import type { Room } from '../shared/net/room.ts';

/** "Play again" in a room with somebody else sitting in it.
 *
 *  Direct user feedback: "the play again button doesnt work in multiplayer." It never could —
 *  `OnlineGame` handed the button `() => undefined`, so it rendered, accepted the click, and did
 *  nothing. The fix is not merely to wire it up: a unilateral restart would let one player wipe
 *  a finished game before the other had read the final score, so it works like every other
 *  shared decision at this table — both ask, then it happens. */
function seated(): Room {
  const a = join(createRoom('TEST', 'seed-rematch', DEFAULT_CONFIG), 'client-a');
  if (!a.ok) throw new Error(a.error);
  const b = join(a.value.room, 'client-b');
  if (!b.ok) throw new Error(b.error);
  return b.value.room;
}

/** A finished game, without playing one out: the rematch rules care only about the phase, and
 *  driving a real game to 10 would be testing the shuffle. */
function gameOver(room: Room): Room {
  return {
    ...room,
    state: { ...room.state, phase: 'game_over', winner: 'A', gameScore: { A: 10, B: 6 } },
  };
}

function ask(room: Room, client: string): Room {
  const res = requestRematch(room, client, 'seed-next');
  if (!res.ok) throw new Error(res.error);
  return res.value;
}

describe('a rematch takes both players', () => {
  it('does not restart on one player asking alone', () => {
    const after = ask(gameOver(seated()), 'client-a');

    // Still the finished game — the other player has not agreed, and until they do the final
    // score stays on screen for them to look at.
    expect(after.state.phase).toBe('game_over');
    expect(after.state.gameScore).toEqual({ A: 10, B: 6 });
    expect(rematchViewFor(after, 'A')).toEqual({ mine: true, theirs: false });
    expect(rematchViewFor(after, 'B')).toEqual({ mine: false, theirs: true });
  });

  it('starts a fresh game once both have asked', () => {
    const after = ask(ask(gameOver(seated()), 'client-a'), 'client-b');

    expect(after.state.phase).toBe('select');
    // A new GAME, not the next hand: the score starts over.
    expect(after.state.gameScore).toEqual({ A: 0, B: 0 });
    expect(after.state.winner).toBeNull();
    // The offer is spent, so the next game's ending starts from a clean slate rather than
    // restarting instantly off two stale requests.
    expect(rematchViewFor(after, 'A')).toEqual({ mine: false, theirs: false });
  });

  it('carries the table rules into the new game', () => {
    // The players already negotiated these once. Making them agree again to play a second game
    // would be asking the same question twice.
    const base = seated();
    const withRules: Room = {
      ...base,
      state: {
        ...base.state,
        config: {
          ...base.state.config,
          lonerTiersEnabled: { blind_hand: true, full_blind: true },
        },
      },
    };
    const after = ask(ask(gameOver(withRules), 'client-a'), 'client-b');
    expect(after.state.config.lonerTiersEnabled).toEqual({ blind_hand: true, full_blind: true });
  });

  it('passes the deal to the other player', () => {
    const before = gameOver(seated());
    const after = ask(ask(before, 'client-a'), 'client-b');
    expect(after.state.dealer).not.toBe(before.state.dealer);
  });

  it('refuses while a game is still being played', () => {
    // The button only exists on the game-over banner, but the message arrives off a socket and
    // the server does not get to assume a client only sends what its own UI offers.
    const res = requestRematch(seated(), 'client-a', 'seed-next');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not over/i);
  });

  it('refuses someone who is not seated in the room', () => {
    const res = requestRematch(gameOver(seated()), 'client-nobody', 'seed-next');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not seated/i);
  });

  it('treats one player asking twice as one request', () => {
    // Double-clicking your own button must not stand in for the other player's agreement.
    const after = ask(ask(gameOver(seated()), 'client-a'), 'client-a');
    expect(after.state.phase).toBe('game_over');
    expect(rematchViewFor(after, 'B')).toEqual({ mine: false, theirs: true });
  });
});
