import { describe, it, expect } from 'vitest';
import type { GameState, HandId, Player } from '../shared/engine/types.ts';
import { trickOrder, otherPlayer } from '../shared/engine/legal.ts';

/** Going alone drops the maker's blind hand, so a trick is three hands: one belonging to the
 *  player going alone, two to the defender. The order those three played in used to be the ring
 *  rotated to whoever led, which in four of the six possible lead positions put the defender's
 *  two hands back to back.
 *
 *  Direct user feedback: "in a loner, unless the alone hand leads, it should default to
 *  alternate between users, bc if the player with two hands lead, they shouldnt have to play
 *  both of their cards before the alone hand goes." That is a fairness point rather than a
 *  cosmetic one — committing both defending cards before the alone player has shown anything
 *  gives the alone player information the defender never gets in return.
 *
 *  Built from a ring directly rather than by playing a deal out: this is a pure function of the
 *  ring, the leader and who is alone, and driving a real deal to each of the six lead positions
 *  would be testing the shuffle more than the ordering. */
function ringState(dealer: Player, maker: Player, leaderIndex: number): GameState {
  const nonDealer = otherPlayer(dealer);
  const full: HandId[] = [
    { player: nonDealer, role: 'selected' },
    { player: dealer, role: 'selected' },
    { player: nonDealer, role: 'blind' },
    { player: dealer, role: 'blind' },
  ];
  return {
    ringOrder: full.filter((h) => !(h.player === maker && h.role === 'blind')),
    currentTrickLeaderRingIndex: leaderIndex,
    maker,
    lonerTier: 'standard',
    phase: 'play',
    currentTrick: [],
  } as unknown as GameState;
}

describe('a loner trick alternates players wherever it can', () => {
  for (const dealer of ['A', 'B'] as Player[]) {
    for (const maker of ['A', 'B'] as Player[]) {
      for (let leaderIndex = 0; leaderIndex < 3; leaderIndex++) {
        it(`dealer ${dealer}, alone ${maker}, leader index ${leaderIndex}`, () => {
          const state = ringState(dealer, maker, leaderIndex);
          const order = trickOrder(state);
          const players = order.map((h) => h.player);

          expect(order).toHaveLength(3);
          // Every hand plays exactly once, whatever the order.
          expect(new Set(order.map((h) => `${h.player}-${h.role}`)).size).toBe(3);
          // The leader is still whoever the ring says leads — reordering the rest must never
          // take the lead away from the hand that won the previous trick.
          expect(order[0]).toEqual(state.ringOrder![leaderIndex]);

          if (players[0] === maker) {
            // The alone hand leads: there is only one of it, so it cannot sit between the
            // defender's two. This is the "unless the alone hand leads" case.
            expect(players).toEqual([maker, otherPlayer(maker), otherPlayer(maker)]);
          } else {
            // A defender leads: the alone hand goes second, so the defender never commits both
            // cards before seeing it.
            expect(players).toEqual([otherPlayer(maker), maker, otherPlayer(maker)]);
          }
        });
      }
    }
  }

  it('never makes the defender play both hands before the alone hand, except off its own lead', () => {
    // The regression in a single assertion across every configuration. Before the fix this
    // failed for exactly the cases where a defender hand led.
    for (const dealer of ['A', 'B'] as Player[]) {
      for (const maker of ['A', 'B'] as Player[]) {
        for (let leaderIndex = 0; leaderIndex < 3; leaderIndex++) {
          const players = trickOrder(ringState(dealer, maker, leaderIndex)).map((h) => h.player);
          if (players[0] === maker) continue;
          expect(
            players.indexOf(maker),
            `dealer ${dealer}, alone ${maker}, lead ${leaderIndex}`,
          ).toBe(1);
        }
      }
    }
  });
});

describe('a full four-hand trick is untouched', () => {
  it('alternates from every lead position, exactly as the ring already did', () => {
    for (const dealer of ['A', 'B'] as Player[]) {
      for (let leaderIndex = 0; leaderIndex < 4; leaderIndex++) {
        const nonDealer = otherPlayer(dealer);
        const state = {
          ringOrder: [
            { player: nonDealer, role: 'selected' },
            { player: dealer, role: 'selected' },
            { player: nonDealer, role: 'blind' },
            { player: dealer, role: 'blind' },
          ],
          currentTrickLeaderRingIndex: leaderIndex,
          maker: null,
          lonerTier: null,
          phase: 'play',
          currentTrick: [],
        } as unknown as GameState;

        const players = trickOrder(state).map((h) => h.player);
        expect(players).toHaveLength(4);
        for (let i = 1; i < players.length; i++) {
          expect(players[i], `dealer ${dealer}, lead ${leaderIndex}`).not.toBe(players[i - 1]);
        }
      }
    }
  });
});
