import type { GameState, HandId, Player, PlayerView } from './types.ts';
import { actingHand, otherPlayer } from './legal.ts';

const DEAL_OVER_PHASES = new Set(['hand_complete', 'game_over']);

function handsEqual(a: HandId | null, b: HandId): boolean {
  return !!a && a.player === b.player && a.role === b.role;
}

function visible(state: GameState, hand: HandId): boolean {
  if (DEAL_OVER_PHASES.has(state.phase)) return true;
  if (hand.role === 'selected') {
    return state.selectedHandsRevealed || handsEqual(actingHand(state), hand);
  }
  return handsEqual(actingHand(state), hand);
}

export function redact(state: GameState, you: Player): PlayerView {
  const opponent = otherPlayer(you);
  const yourHands = state.players[you];
  const oppHands = state.players[opponent];

  return {
    you,
    phase: state.phase,
    dealer: state.dealer,
    gameScore: state.gameScore,
    winner: state.winner,

    ownSelectedHand: visible(state, { player: you, role: 'selected' })
      ? yourHands.selectedHand
      : null,
    ownBlindHand: visible(state, { player: you, role: 'blind' }) ? yourHands.blindHand : null,

    opponentSelectedCount: oppHands.selectedHand?.length ?? 0,
    opponentBlindCount: oppHands.blindHand?.length ?? 0,
    opponentSelectedHand: DEAL_OVER_PHASES.has(state.phase) ? oppHands.selectedHand : null,
    opponentBlindHand: DEAL_OVER_PHASES.has(state.phase) ? oppHands.blindHand : null,

    upcard: state.upcardRevealed ? (state.kitty[0] ?? null) : null,
    turnedDownSuit: state.turnedDownSuit,
    trump: state.trump,
    maker: state.maker,
    lonerTier: state.lonerTier,

    currentTrick: state.currentTrick,
    tricksWon: state.tricksWon,
    trickNumber: state.trickNumber,

    actingHand: actingHand(state),
  };
}
