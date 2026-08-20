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

export function actingHand(state: GameState): HandId | null {
  if (state.phase === 'dealer_exchange') return { player: state.dealer, role: 'selected' };
  if (state.phase === 'play' && state.ringOrder) {
    const idx =
      (state.currentTrickLeaderRingIndex + state.currentTrick.length) % state.ringOrder.length;
    return state.ringOrder[idx]!;
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
      const nonDealer = otherPlayer(state.dealer);
      const turn =
        state.players[nonDealer].selectedHand === null
          ? nonDealer
          : state.players[state.dealer].selectedHand === null
            ? state.dealer
            : null;
      if (turn !== player) return [];
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
