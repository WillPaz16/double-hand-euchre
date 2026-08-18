import type { Action, PlayerView } from '../../shared/engine/types.ts';

const SUIT_LABEL: Record<string, string> = {
  clubs: 'Clubs',
  diamonds: 'Diamonds',
  hearts: 'Hearts',
  spades: 'Spades',
};

function label(a: Action): string {
  switch (a.type) {
    case 'SELECT_HAND':
      return `Pick Packet ${a.packetIndex + 1}`;
    case 'DECLARE_FULL_BLIND_LONER':
      return 'Go Alone — Full Blind (8 pts)';
    case 'DECLARE_BLIND_TRUMP_LONER':
      return `Go Alone — Blind Trump: ${SUIT_LABEL[a.suit]} (6 pts)`;
    case 'ORDER_UP':
      return a.loner ? 'Order It Up — Alone (4 pts)' : 'Order It Up';
    case 'NAME_TRUMP':
      return a.loner ? `Call ${SUIT_LABEL[a.suit]} — Alone (4 pts)` : `Call ${SUIT_LABEL[a.suit]}`;
    case 'PASS':
      return 'Pass';
    default:
      return a.type;
  }
}

const BID_PHASES = new Set([
  'select',
  'loner_full_blind',
  'loner_blind_trump',
  'bidding_round1',
  'bidding_round2',
]);

export function BidPanel({
  view,
  legal,
  play,
}: {
  view: PlayerView;
  legal: Action[];
  play: (a: Action) => void;
}) {
  if (!BID_PHASES.has(view.phase) || legal.length === 0) return null;

  return (
    <div className="bid-panel">
      {legal.map((a, i) => (
        <button key={i} className="bid-button" onClick={() => play(a)}>
          {label(a)}
        </button>
      ))}
    </div>
  );
}
