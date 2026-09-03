import type { Action, Card } from './types.ts';

function sameCard(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

/** Structural equality for two Actions.
 *
 *  The engine's own legality guard (reducer.ts) and `useGame` both used to compare a candidate
 *  action against `legalActions()` with `JSON.stringify(a) === JSON.stringify(b)`. That is safe
 *  only by accident: both sides are built by the same code path in the same process, so their
 *  keys always happen to be in the same order. The assumption breaks the moment an action
 *  arrives from anywhere else — `JSON.stringify` is key-ORDER sensitive, so
 *  `{"type":"PASS","player":"A"}` and `{"player":"A","type":"PASS"}` are the same move and
 *  different strings. An action that has been serialised, sent over a socket and parsed again
 *  carries whatever key order the sender's serialiser chose, so the authoritative side would
 *  reject perfectly legal moves depending on which client sent them — intermittently, and
 *  only in multiplayer.
 *
 *  Comparing field by field removes the dependency on key order entirely. `loner` is normalised
 *  with `!!` because it is declared optional (`loner?: boolean`): `legalActions` always emits it
 *  explicitly, but an absent `loner` and `loner: false` mean the same move and must compare
 *  equal.
 */
export function sameAction(a: Action, b: Action): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'SELECT_HAND':
      return b.type === 'SELECT_HAND' && a.player === b.player && a.packetIndex === b.packetIndex;
    case 'DECLARE_FULL_BLIND_LONER':
      return b.type === 'DECLARE_FULL_BLIND_LONER' && a.player === b.player;
    case 'DECLARE_BLIND_HAND_LONER':
      return b.type === 'DECLARE_BLIND_HAND_LONER' && a.player === b.player;
    case 'PASS':
      return b.type === 'PASS' && a.player === b.player;
    case 'ORDER_UP':
      return b.type === 'ORDER_UP' && a.player === b.player && !!a.loner === !!b.loner;
    case 'NAME_TRUMP':
      return (
        b.type === 'NAME_TRUMP' &&
        a.player === b.player &&
        a.suit === b.suit &&
        !!a.loner === !!b.loner
      );
    case 'DEALER_DISCARD':
      return b.type === 'DEALER_DISCARD' && sameCard(a.card, b.card);
    case 'PLAY_CARD':
      return b.type === 'PLAY_CARD' && sameCard(a.card, b.card);
  }
}
