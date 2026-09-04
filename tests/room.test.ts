import { describe, it, expect } from 'vitest';
import {
  advanceDeal,
  opponentName,
  bothSeated,
  createRoom,
  disconnect,
  join,
  legalFor,
  needsDealAdvance,
  opponentPresent,
  seatOf,
  submit,
  viewFor,
} from '../shared/net/room.ts';
import { makeRoomCode, normaliseRoomCode, ROOM_CODE_LENGTH } from '../shared/net/protocol.ts';
import { DEFAULT_CONFIG, legalActions } from '../shared/engine/index.ts';
import type { Action, Player } from '../shared/engine/types.ts';
import type { Room } from '../shared/net/room.ts';

function room(): Room {
  return createRoom('TEST', 'seed-room-1', DEFAULT_CONFIG);
}

/** Seats two clients and returns the room with both present. */
function seated(): Room {
  const a = join(room(), 'client-a');
  if (!a.ok) throw new Error(a.error);
  const b = join(a.value.room, 'client-b');
  if (!b.ok) throw new Error(b.error);
  return b.value.room;
}

const CLIENT_OF: Record<Player, string> = { A: 'client-a', B: 'client-b' };

/** Whichever seat is actually on the clock, derived rather than assumed.
 *
 *  Worth stating because the obvious guess is wrong: in `select` the NON-dealer chooses first,
 *  and `createRoom` deals for 'A', so seat 'B' opens the game. Hard-coding 'A' here made four
 *  of these tests assert against an empty legal list and fail for a reason that had nothing to
 *  do with the room logic they were testing. */
function onTurn(r: Room): { seat: Player; client: string; legal: Action[] } {
  for (const seat of ['A', 'B'] as const) {
    const legal = legalActions(r.state, seat);
    if (legal.length > 0) return { seat, client: CLIENT_OF[seat], legal };
  }
  throw new Error('no seat has a legal action');
}

function offTurn(r: Room): { seat: Player; client: string } {
  const other: Player = onTurn(r).seat === 'A' ? 'B' : 'A';
  return { seat: other, client: CLIENT_OF[other] };
}

describe('room seating', () => {
  it('seats the first two clients and refuses a third', () => {
    const r = seated();
    expect(seatOf(r, 'client-a')).toBe('A');
    expect(seatOf(r, 'client-b')).toBe('B');
    expect(bothSeated(r)).toBe(true);

    const third = join(r, 'client-c');
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.error).toMatch(/two players/i);
  });

  it('gives a reconnecting client its OWN seat back, not the free one', () => {
    // The failure this pins down is silent and total: if a returning player were handed the
    // first free seat instead of their own, they would be looking at their opponent's hand.
    let r = seated();
    r = disconnect(r, 'client-a');
    expect(opponentPresent(r, 'B')).toBe(false);

    const back = join(r, 'client-a');
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.value.seat).toBe('A');
    expect(opponentPresent(back.value.room, 'B')).toBe(true);
  });

  it('keeps a disconnected player seated rather than freeing the chair', () => {
    const r = disconnect(seated(), 'client-b');
    expect(seatOf(r, 'client-b')).toBe('B');
    // A stranger who knows the code still cannot take the empty-looking seat.
    expect(join(r, 'stranger').ok).toBe(false);
  });
});

describe('room authority', () => {
  it('refuses actions from a client with no seat', () => {
    const r = seated();
    const { legal } = onTurn(r);
    const res = submit(r, 'nobody', legal[0]!);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not seated/i);
  });

  it('refuses to start before both seats are filled', () => {
    const first = join(room(), 'client-a');
    if (!first.ok) throw new Error(first.error);
    const solo = first.value.room;

    // Pick the seat the engine says is on turn, then check the room overrides it.
    const opener = onTurn(solo);
    expect(opener.legal.length).toBeGreaterThan(0); // the ENGINE would allow it
    expect(legalFor(solo, opener.seat)).toEqual([]); // the ROOM offers nothing
    const res = submit(solo, 'client-a', opener.legal[0]!);
    expect(res.ok).toBe(false); // ...and refuses it outright
  });

  it("refuses one seat's attempt to play the other seat's action", () => {
    // The core cheat: the off-turn seat sends an action that is legal in the game right now but
    // is the other player's to make. Attribution comes from the socket, so this must be
    // rejected even though the action itself is well-formed and currently legal for somebody.
    const r = seated();
    const turn = onTurn(r);
    const thief = offTurn(r);
    expect(legalActions(r.state, thief.seat)).toEqual([]); // one seat on turn at a time

    const stolen = submit(r, thief.client, turn.legal[0]!);
    expect(stolen.ok).toBe(false);
    if (!stolen.ok) expect(stolen.error).toMatch(/not legal/i);

    // ...and the same action from the rightful seat goes through.
    expect(submit(r, turn.client, turn.legal[0]!).ok).toBe(true);
  });

  it('accepts an action that survived a JSON round trip', () => {
    // Actions arrive off a socket as re-parsed JSON, so their key order is the sender's choice.
    // This is exactly the case a `JSON.stringify` equality check gets wrong.
    const r = seated();
    const turn = onTurn(r);
    const original = turn.legal[0]!;
    const reordered = JSON.parse(
      JSON.stringify(original, Object.keys(original).sort()),
    ) as typeof original;

    expect(submit(r, turn.client, reordered).ok).toBe(true);
  });

  it('advances state on a legal move without mutating the original room', () => {
    const r = seated();
    const turn = onTurn(r);
    const res = submit(r, turn.client, turn.legal[0]!);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const next = res.value.room;
    expect(next.state).not.toBe(r.state); // pure: a new state, not a mutation
    expect(r.state.phase).toBe('select'); // original untouched

    expect(viewFor(next, 'A').you).toBe('A');
    expect(viewFor(next, 'B').you).toBe('B');
    // Nothing was swept: SELECT_HAND cannot complete a trick.
    expect(res.value.completedTrick).toBeNull();
  });

  it('never leaks the opponent hand into a seat view mid-deal', () => {
    const r = seated();
    for (const seat of ['A', 'B'] as const) {
      const v = viewFor(r, seat);
      expect(v.opponentSelectedHand).toBeNull();
      expect(v.opponentBlindHand).toBeNull();
    }
  });
});

describe('display names', () => {
  it('records a name per seat and reports the OTHER seat\'s to each player', () => {
    const a = join(room(), 'client-a', 'Ada');
    if (!a.ok) throw new Error(a.error);
    const b = join(a.value.room, 'client-b', 'Bo');
    if (!b.ok) throw new Error(b.error);
    const r = b.value.room;

    // Each side is told who is across the table, never their own name back.
    expect(opponentName(r, 'A')).toBe('Bo');
    expect(opponentName(r, 'B')).toBe('Ada');
  });

  it('leaves the name null when none is given', () => {
    const r = seated(); // joins without names
    expect(opponentName(r, 'A')).toBeNull();
    expect(opponentName(r, 'B')).toBeNull();
  });

  it('keeps the existing name when a reconnecting client sends none', () => {
    const a = join(room(), 'client-a', 'Ada');
    if (!a.ok) throw new Error(a.error);
    const dropped = disconnect(a.value.room, 'client-a');
    const back = join(dropped, 'client-a'); // no name this time
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.value.room.names.A).toBe('Ada');
  });
});

describe('deal advance', () => {
  it('is a no-op until the deal has actually settled', () => {
    const r = seated();
    expect(needsDealAdvance(r)).toBe(false);
    expect(advanceDeal(r, 'seed-2')).toBe(r); // same reference: nothing happened
  });
});

describe('room codes', () => {
  it('generates codes of the expected length from unambiguous glyphs', () => {
    const code = makeRoomCode(() => 0);
    expect(code).toHaveLength(ROOM_CODE_LENGTH);
    expect(code).not.toMatch(/[01IO]/);
  });

  it('normalises user typing and rejects malformed codes', () => {
    expect(normaliseRoomCode('  ab2c ')).toBe('AB2C');
    expect(normaliseRoomCode('AB2')).toBeNull();
    expect(normaliseRoomCode('AB2CD')).toBeNull();
    expect(normaliseRoomCode('AB0C')).toBeNull(); // 0 is not in the alphabet
  });
});
