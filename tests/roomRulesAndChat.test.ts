import { describe, expect, it } from 'vitest';
import {
  advanceDeal,
  createRoom,
  join,
  legalFor,
  normaliseRoom,
  postChat,
  rulesViewFor,
  submit,
  voteRules,
  type Room,
} from '../shared/net/room.ts';
import { MAX_CHAT_HISTORY, MAX_CHAT_LENGTH, type LonerRules } from '../shared/net/protocol.ts';
import { DEFAULT_CONFIG, legalActions } from '../shared/engine/index.ts';

const ON: LonerRules = { blind_hand: true, full_blind: true };
const OFF: LonerRules = { blind_hand: false, full_blind: false };
const ONLY_HAND: LonerRules = { blind_hand: true, full_blind: false };

function must<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

function table(a: LonerRules | null, b: LonerRules | null): Room {
  const first = must(join(createRoom('TEST', 'seed-rules', DEFAULT_CONFIG), 'client-a', null, undefined, a));
  return must(join(first.room, 'client-b', null, undefined, b)).room;
}

describe('rule agreement when two players sit down', () => {
  it('matching settings lock straight away — no prompt, the table plays by them', () => {
    const room = table(ONLY_HAND, ONLY_HAND);
    expect(room.rulesLocked).toBe(true);
    expect(room.state.config.lonerTiersEnabled).toEqual(ONLY_HAND);
    expect(legalFor(room, 'A').length + legalFor(room, 'B').length).toBeGreaterThan(0);
  });

  it('differing settings hold the table: nobody can move until they agree', () => {
    const room = table(ON, OFF);
    expect(room.rulesLocked).toBe(false);
    expect(legalFor(room, 'A')).toEqual([]);
    expect(legalFor(room, 'B')).toEqual([]);

    // The server refuses a move even if a client sends one anyway.
    const anyMove = legalActions(room.state, 'A')[0] ?? legalActions(room.state, 'B')[0]!;
    expect(submit(room, 'client-a', anyMove).ok).toBe(false);

    const view = rulesViewFor(room, 'A');
    expect(view).toMatchObject({ locked: false, mine: ON, theirs: OFF, myVote: null, theirVote: null });
  });

  it('one vote is not agreement; matching votes lock and write the config', () => {
    let room = table(ON, OFF);
    room = must(voteRules(room, 'client-a', ONLY_HAND));
    expect(room.rulesLocked).toBe(false);
    expect(rulesViewFor(room, 'B').theirVote).toEqual(ONLY_HAND);

    room = must(voteRules(room, 'client-b', OFF));
    expect(room.rulesLocked).toBe(false);

    room = must(voteRules(room, 'client-b', ONLY_HAND));
    expect(room.rulesLocked).toBe(true);
    expect(room.state.config.lonerTiersEnabled).toEqual(ONLY_HAND);
    expect(room.votes).toEqual({ A: null, B: null });
  });

  it('agreeing takes one click: switching to what the other player already has deals', () => {
    let room = table(ON, OFF);
    room = must(voteRules(room, 'client-a', OFF));
    expect(room.rulesLocked).toBe(true);
    expect(room.state.config.lonerTiersEnabled).toEqual(OFF);
  });

  it('locking changes only the rules, never the cards already dealt', () => {
    const before = table(ON, OFF);
    const after = must(voteRules(must(voteRules(before, 'client-a', OFF)), 'client-b', OFF));
    expect(after.state.players).toEqual(before.state.players);
    expect(after.state.kitty).toEqual(before.state.kitty);
  });

  it('rejoining with different settings does not change a locked table’s rules', () => {
    const rejoined = must(join(table(OFF, OFF), 'client-a', null, undefined, ON)).room;
    expect(rejoined.state.config.lonerTiersEnabled).toEqual(OFF);
    expect(rejoined.rulesLocked).toBe(true);
  });

  it('an older client that sends no settings counts as the defaults', () => {
    const room = table(null, DEFAULT_CONFIG.lonerTiersEnabled);
    expect(room.rulesLocked).toBe(true);
  });

  it('a player alone at the table cannot vote', () => {
    const alone = must(join(createRoom('TEST', 's', DEFAULT_CONFIG), 'client-a', null, undefined, ON)).room;
    expect(voteRules(alone, 'client-a', ON).ok).toBe(false);
  });

  it('a room stored before rule agreement existed resumes as already agreed', () => {
    const legacy = table(OFF, OFF) as Partial<Room>;
    delete legacy.rulesLocked;
    delete legacy.proposed;
    delete legacy.votes;
    delete legacy.chat;
    const room = normaliseRoom(legacy as Room);
    expect(room.rulesLocked).toBe(true);
    expect(room.chat).toEqual([]);
  });
});

/** Direct user feedback: blind loners "can be switched on at any time during a game for the
 *  next round (so after a scoring event)". */
describe('changing rules mid-game', () => {
  const handOver = (room: Room): Room => ({ ...room, state: { ...room.state, phase: 'hand_complete' } });

  it('an agreed change waits for the next deal — the hand in progress keeps its rules', () => {
    let room = table(OFF, OFF);
    room = must(voteRules(room, 'client-a', ON));
    expect(room.pendingRules).toBeNull();
    expect(rulesViewFor(room, 'B').theirVote).toEqual(ON);

    room = must(voteRules(room, 'client-b', ON));
    expect(room.pendingRules).toEqual(ON);
    expect(room.state.config.lonerTiersEnabled).toEqual(OFF);
    expect(rulesViewFor(room, 'A').next).toEqual(ON);

    room = advanceDeal(handOver(room), 'next-seed');
    expect(room.state.config.lonerTiersEnabled).toEqual(ON);
    expect(room.pendingRules).toBeNull();
  });

  it('a proposal never pauses play', () => {
    const room = must(voteRules(table(OFF, OFF), 'client-a', ON));
    expect(legalFor(room, 'A').length + legalFor(room, 'B').length).toBeGreaterThan(0);
  });

  it('"keep current rules" drops the proposal outright', () => {
    let room = must(voteRules(table(OFF, OFF), 'client-a', ON));
    room = must(voteRules(room, 'client-b', OFF));
    expect(room.votes).toEqual({ A: null, B: null });
    expect(room.pendingRules).toBeNull();
  });

  it('a new proposal clears an old answer, so a stale "keep" cannot refuse it unseen', () => {
    let room = must(voteRules(table(OFF, OFF), 'client-a', ON));
    room = must(voteRules(room, 'client-b', ONLY_HAND));
    expect(room.votes).toEqual({ A: null, B: ONLY_HAND });
  });

  it('agreeing to the rules already in effect cancels a pending change', () => {
    let room = must(voteRules(must(voteRules(table(OFF, OFF), 'client-a', ON)), 'client-b', ON));
    expect(room.pendingRules).toEqual(ON);
    room = must(voteRules(room, 'client-a', OFF));
    room = must(voteRules(room, 'client-b', OFF));
    expect(room.pendingRules).toBeNull();
    expect(advanceDeal(handOver(room), 's').state.config.lonerTiersEnabled).toEqual(OFF);
  });
});

describe('chat', () => {
  it('attributes a line to the SENDER’s seat and numbers it', () => {
    let room = table(OFF, OFF);
    const first = must(postChat(room, 'client-b', 'nice hand'));
    room = first.room;
    const second = must(postChat(room, 'client-a', 'thanks'));
    expect(first.message).toEqual({ id: 1, from: 'B', text: 'nice hand' });
    expect(second.message).toEqual({ id: 2, from: 'A', text: 'thanks' });
    expect(second.room.chat).toHaveLength(2);
  });

  it('cleans what it is sent: whitespace collapsed, length capped, empty refused', () => {
    const room = table(OFF, OFF);
    expect(must(postChat(room, 'client-a', '  hi \n\n there  ')).message.text).toBe('hi there');
    expect(must(postChat(room, 'client-a', 'x'.repeat(500))).message.text).toHaveLength(MAX_CHAT_LENGTH);
    expect(postChat(room, 'client-a', '   ').ok).toBe(false);
    expect(postChat(room, 'client-a', 42).ok).toBe(false);
  });

  it('refuses a client that is not seated', () => {
    expect(postChat(table(OFF, OFF), 'stranger', 'hello').ok).toBe(false);
  });

  it('keeps only the most recent history, and ids keep increasing past the cap', () => {
    let room = table(OFF, OFF);
    for (let i = 0; i < MAX_CHAT_HISTORY + 5; i++) room = must(postChat(room, 'client-a', `m${i}`)).room;
    expect(room.chat).toHaveLength(MAX_CHAT_HISTORY);
    expect(room.chat.at(-1)!.id).toBe(MAX_CHAT_HISTORY + 5);
    expect(room.chat[0]!.text).toBe('m5');
  });
});
