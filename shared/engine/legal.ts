import type { Action, Card, GameState, HandId, Player, Suit } from './types.ts';
import { legalPlays, effectiveSuit } from './rules.ts';
import { SUITS } from './deck.ts';

export function otherPlayer(player: Player): Player {
  return player === 'A' ? 'B' : 'A';
}

/** Whose turn it is in a two-step bidding-style phase (select / loner windows / bidding). */
function turnPlayer(state: GameState): Player | null {
  const nonDealer = otherPlayer(state.dealer);
  if (state.passedBy.length === 0) return nonDealer;
  if (state.passedBy.length === 1) return state.dealer;
  return null;
}

export function sameHand(a: HandId, b: HandId): boolean {
  return a.player === b.player && a.role === b.role;
}

/** The hands of the CURRENT trick, in the order they play, starting with the leader.
 *
 *  For a full four-hand trick this is just the ring rotated to the leader, and the ring already
 *  alternates players by construction (non-dealer, dealer, non-dealer, dealer) so every
 *  rotation of it alternates too.
 *
 *  A loner is the case that needs thought, and it was wrong — direct user feedback: "in a
 *  loner, unless the alone hand leads, it should default to alternate between users, because if
 *  the player with two hands leads, they shouldn't have to play both of their cards before the
 *  alone hand goes." Going alone removes the maker's blind hand, leaving three: one from the
 *  maker, two from the defender. Rotating a three-hand ring cannot keep alternating, and in
 *  four of the six possible lead positions it put the defender's two hands back to back — so
 *  the defender committed both cards before seeing anything from the person they are trying to
 *  euchre, which is exactly the information the alone player should not be given for free.
 *
 *  So when a DEFENDER leads, the alone hand is pulled into second place: defender, alone,
 *  defender. When the ALONE hand leads there is nothing to interleave — one hand cannot go
 *  between two others — and the defender's pair follows in ring order, which is the "unless the
 *  alone hand leads" case and stays as it was. */
export function trickOrder(state: GameState): HandId[] {
  const ring = state.ringOrder;
  if (!ring) return [];
  const rotated = ring.map(
    (_, i) => ring[(state.currentTrickLeaderRingIndex + i) % ring.length]!,
  );
  if (!state.lonerTier || !state.maker) return rotated;
  const [leader, ...rest] = rotated;
  if (!leader || leader.player === state.maker) return rotated;
  const alone = rest.find((h) => h.player === state.maker);
  if (!alone) return rotated;
  return [leader, alone, ...rest.filter((h) => !sameHand(h, alone))];
}

export function actingHand(state: GameState): HandId | null {
  if (state.phase === 'dealer_exchange') return { player: state.dealer, role: 'selected' };
  if (state.phase === 'play' && state.ringOrder) {
    return trickOrder(state)[state.currentTrick.length] ?? null;
  }
  return null;
}

function handCards(state: GameState, hand: HandId): Card[] {
  const ph = state.players[hand.player];
  return (hand.role === 'selected' ? ph.selectedHand : ph.blindHand) ?? [];
}

export function legalActions(state: GameState, player: Player): Action[] {
  switch (state.phase) {
    case 'select': {
      // Simultaneous, not in turn — direct user feedback: "the first action for either player
      // is selecting a hand ... those can be made simultaneously."
      //
      // This used to give the turn to the non-dealer and only then to the dealer, so one player
      // sat watching the other choose between two face-down packets. The choice reveals
      // nothing and neither player can learn anything from watching the other make it, so the
      // ordering bought nothing and cost somebody a wait every single deal. At a real table
      // both players pick their cards up at once.
      //
      // The reducer never required the sequence: SELECT_HAND resolves one player's packets and
      // only checks `bothSelected` to decide whether to move on, so it already handled either
      // order. This gate was the whole of the constraint.
      if (state.players[player].selectedHand !== null) return [];
      return [0, 1].map((packetIndex) => ({
        type: 'SELECT_HAND',
        player,
        packetIndex: packetIndex as 0 | 1,
      }));
    }

    case 'loner_full_blind': {
      if (turnPlayer(state) !== player) return [];
      return [{ type: 'DECLARE_FULL_BLIND_LONER', player }, { type: 'PASS', player }];
    }

    case 'loner_blind_hand': {
      // No suit argument — trump for this tier is the upcard's suit, which is already
      // revealed by the time this window opens (see reducer.ts PASS). One action, not four.
      if (turnPlayer(state) !== player) return [];
      return [{ type: 'DECLARE_BLIND_HAND_LONER', player }, { type: 'PASS', player }];
    }

    case 'bidding_round1': {
      if (turnPlayer(state) !== player) return [];
      return [
        { type: 'ORDER_UP', player, loner: false },
        { type: 'ORDER_UP', player, loner: true },
        { type: 'PASS', player },
      ];
    }

    case 'bidding_round2': {
      if (turnPlayer(state) !== player) return [];
      const nameable = SUITS.filter((s) => s !== state.turnedDownSuit);
      const names: Action[] = nameable.flatMap((suit) => [
        { type: 'NAME_TRUMP', player, suit, loner: false },
        { type: 'NAME_TRUMP', player, suit, loner: true },
      ]);
      const dealerStuck =
        state.config.stickTheDealer && player === state.dealer && state.passedBy.length === 1;
      if (dealerStuck) return names;
      return [...names, { type: 'PASS', player }];
    }

    case 'dealer_exchange': {
      if (player !== state.dealer) return [];
      const hand = state.players[state.dealer].selectedHand ?? [];
      return hand.map((card) => ({ type: 'DEALER_DISCARD', card }));
    }

    case 'play': {
      const acting = actingHand(state);
      if (!acting || acting.player !== player || !state.trump) return [];
      const hand = handCards(state, acting);
      const ledEffectiveSuit: Suit | null =
        state.currentTrick.length === 0
          ? null
          : effectiveSuit(state.currentTrick[0]!.card, state.trump);
      const plays = legalPlays(hand, ledEffectiveSuit, state.trump);
      return plays.map((card) => ({ type: 'PLAY_CARD', card }));
    }

    default:
      return [];
  }
}
