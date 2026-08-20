import { useEffect, useState } from 'react';
import type { Action, PlayerView, Suit } from '../../shared/engine/types.ts';

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
    case 'DECLARE_BLIND_HAND_LONER':
      return 'Go Alone — Blind Hand (6 pts)';
    case 'ORDER_UP':
      return 'Order It Up';
    case 'NAME_TRUMP':
      return `Call ${SUIT_LABEL[a.suit]}`;
    case 'PASS':
      return 'Pass';
    default:
      return a.type;
  }
}

export const BID_PHASES = new Set([
  'select',
  'loner_full_blind',
  'loner_blind_hand',
  'bidding_round1',
  'bidding_round2',
]);

/** A trump call staged but not yet committed — see the two-step flow below. */
type PendingTrump = { type: 'ORDER_UP' } | { type: 'NAME_TRUMP'; suit: Suit };

export function BidPanel({
  view,
  legal,
  play,
}: {
  view: PlayerView;
  legal: Action[];
  play: (a: Action) => void;
}) {
  // Naming trump and going alone used to be ONE button ("Order It Up — Alone (4 pts)"),
  // because the engine already treats them as a single atomic action (ORDER_UP/NAME_TRUMP
  // both just carry an optional `loner` flag — see legal.ts). But at the table you call
  // trump first and decide alone-or-with-partner as its own, separate decision — bundling
  // them into one label made "alone" easy to miss and easy to tap by accident. This stages
  // the trump choice locally (component state, not engine state — the engine still only ever
  // sees one action) and asks the alone question as its own screen.
  const [pending, setPending] = useState<PendingTrump | null>(null);
  // The biggest bet in the game — zero information, for the whole hand, no way back once
  // committed (RULES.md §2: a declaration can't be revisited). The loner ladder's design
  // spec calls for this one specifically to "demand a deliberate confirm"; the other two
  // tiers still see SOMETHING (their hand, or the upcard) before committing, so only this one
  // gets a second gate.
  const [confirmingFullBlind, setConfirmingFullBlind] = useState(false);

  // Cleared whenever the phase moves on, so a stale staged choice from a finished window
  // can never leak into the next one.
  useEffect(() => {
    setPending(null);
    setConfirmingFullBlind(false);
  }, [view.phase]);

  if (!BID_PHASES.has(view.phase) || legal.length === 0) return null;

  if (confirmingFullBlind) {
    const declare = legal.find((a) => a.type === 'DECLARE_FULL_BLIND_LONER');
    if (!declare) return null;
    return (
      <div className="bid-panel">
        <div className="bid-panel-prompt">
          You won't see your hand or the upcard — nothing — until the deal is over. Go full
          blind for 8 points?
        </div>
        <button className="bid-button bid-button-danger" onClick={() => play(declare)}>
          Yes, go blind
        </button>
        <button className="bid-button bid-button-back" onClick={() => setConfirmingFullBlind(false)}>
          Back
        </button>
      </div>
    );
  }

  if (pending) {
    const withPartner = legal.find(
      (a) =>
        (a.type === 'ORDER_UP' || a.type === 'NAME_TRUMP') &&
        !a.loner &&
        (pending.type === 'ORDER_UP' ? a.type === 'ORDER_UP' : a.type === 'NAME_TRUMP' && a.suit === pending.suit),
    );
    const alone = legal.find(
      (a) =>
        (a.type === 'ORDER_UP' || a.type === 'NAME_TRUMP') &&
        a.loner &&
        (pending.type === 'ORDER_UP' ? a.type === 'ORDER_UP' : a.type === 'NAME_TRUMP' && a.suit === pending.suit),
    );
    const suitPart = pending.type === 'NAME_TRUMP' ? ` ${SUIT_LABEL[pending.suit]}` : '';
    return (
      <div className="bid-panel">
        <div className="bid-panel-prompt">Play with your partner hand, or go alone?</div>
        {withPartner && (
          <button className="bid-button" onClick={() => play(withPartner)}>
            {pending.type === 'ORDER_UP' ? 'Order It Up' : `Call${suitPart}`}
          </button>
        )}
        {alone && (
          <button className="bid-button" onClick={() => play(alone)}>
            Go Alone (4 pts)
          </button>
        )}
        <button className="bid-button bid-button-back" onClick={() => setPending(null)}>
          Back
        </button>
      </div>
    );
  }

  // One button per distinct trump call (collapsing the loner:true/false pair into one),
  // plus anything that isn't a trump call at all (PASS, SELECT_HAND, the blind-tier
  // declarations) rendered exactly as the engine returns it.
  const seen = new Set<string>();
  const buttons = legal.filter((a) => {
    if (a.type !== 'ORDER_UP' && a.type !== 'NAME_TRUMP') return true;
    const key = a.type === 'ORDER_UP' ? 'ORDER_UP' : `NAME_TRUMP:${a.suit}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <div className="bid-panel">
      {buttons.map((a, i) => (
        <button
          key={i}
          className="bid-button"
          onClick={() => {
            if (a.type === 'ORDER_UP') setPending({ type: 'ORDER_UP' });
            else if (a.type === 'NAME_TRUMP') setPending({ type: 'NAME_TRUMP', suit: a.suit });
            else if (a.type === 'DECLARE_FULL_BLIND_LONER') setConfirmingFullBlind(true);
            else play(a);
          }}
        >
          {label(a)}
        </button>
      ))}
    </div>
  );
}
