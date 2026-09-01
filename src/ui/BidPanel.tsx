import { useEffect, useRef, useState } from 'react';
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
      return 'Go Alone: Full Blind (8 pts)';
    case 'DECLARE_BLIND_HAND_LONER':
      return 'Go Alone: Blind Hand (6 pts)';
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

/** One trump-call row: the with-partner action paired with its co-legal alone variant. The
 * engine (legal.ts) always emits ORDER_UP/NAME_TRUMP's loner:false and loner:true together,
 * so "alone" never needs to be hidden for legality reasons — only routed to its own control. */
type TrumpRow = { key: string; suit: Suit | null; withPartner?: Action; alone?: Action; suitLabel: string };

export function BidPanel({
  view,
  legal,
  play,
}: {
  view: PlayerView;
  legal: Action[];
  play: (a: Action) => void;
}) {
  // The biggest bet in the game — zero information, for the whole hand, no way back once
  // committed (RULES.md §2: a declaration can't be revisited). The loner ladder's design
  // spec calls for this one specifically to "demand a deliberate confirm"; the other two
  // tiers still see SOMETHING (their hand, or the upcard) before committing, so only this one
  // gets a second gate.
  const [confirmingFullBlind, setConfirmingFullBlind] = useState(false);
  // Round 2 can name any of up to 3 suits — direct user feedback: naming trump should be
  // suit first, THEN with-partner-or-alone for that suit, not all 3 suits' worth of controls
  // (up to 7 buttons) on screen at once. Round 1 never gets this: the upcard fixes the suit
  // already, so there's only one decision to make, not two, and staging it would just be an
  // extra tap for nothing (the exact complaint that got round 1's own two-screen flow
  // collapsed to one in the first place).
  const [pendingSuit, setPendingSuit] = useState<Suit | null>(null);

  // Cleared whenever the phase moves on, so a stale confirm from a finished window can never
  // leak into the next one.
  useEffect(() => {
    setConfirmingFullBlind(false);
    setPendingSuit(null);
  }, [view.phase]);

  // Focus management + Escape-to-cancel for the full-blind confirm screen (2h.4). It replaces
  // the top-level button list wholesale — the button a keyboard/screen-reader user just
  // pressed is gone, unmounted along with everything else in that list, and nothing moved
  // focus to whatever appeared in its place. Landing on "Back" rather than the committing
  // action is the safer default for a confirm step: RULES.md §2 says that declaration can't
  // be revisited once made, so accidentally landing on and activating the wrong control here
  // is the one mistake in this whole panel with no undo.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!confirmingFullBlind) return;
    panelRef.current?.querySelector<HTMLButtonElement>('.bid-button-back')?.focus();
  }, [confirmingFullBlind]);
  // Same "the list you were looking at just got replaced" problem as the full-blind confirm
  // above, but this screen isn't a one-way declaration — landing on its primary action (With
  // Partner) rather than Back is the more useful default here.
  useEffect(() => {
    if (!pendingSuit) return;
    panelRef.current?.querySelector<HTMLButtonElement>('.bid-button:not(.bid-button-back)')?.focus();
  }, [pendingSuit]);
  const onEscape = (back: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') back();
  };

  if (!BID_PHASES.has(view.phase) || legal.length === 0) return null;

  if (confirmingFullBlind) {
    const declare = legal.find((a) => a.type === 'DECLARE_FULL_BLIND_LONER');
    if (!declare) return null;
    return (
      <div className="bid-panel" ref={panelRef} onKeyDown={onEscape(() => setConfirmingFullBlind(false))}>
        <div className="bid-panel-prompt">
          You won't see your hand or the upcard, nothing, until the deal is over. Go full blind
          for 8 points?
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

  // Trump calls (ORDER_UP / NAME_TRUMP) are grouped into one row per suit, pairing the
  // with-partner and alone variants so both fire play() directly — no staged second screen.
  // Everything else (PASS, SELECT_HAND, the blind-tier declarations) renders as its own
  // button exactly as the engine returns it.
  const trumpRows = new Map<string, TrumpRow>();
  const otherButtons: Action[] = [];
  for (const a of legal) {
    if (a.type !== 'ORDER_UP' && a.type !== 'NAME_TRUMP') {
      otherButtons.push(a);
      continue;
    }
    const key = a.type === 'ORDER_UP' ? 'ORDER_UP' : `NAME_TRUMP:${a.suit}`;
    const suit: Suit | null = a.type === 'ORDER_UP' ? (view.upcard?.suit ?? null) : a.suit;
    const suitLabel: string = suit ? (SUIT_LABEL[suit] ?? '') : '';
    const row: TrumpRow = trumpRows.get(key) ?? { key, suit, suitLabel };
    if (a.loner) row.alone = a;
    else row.withPartner = a;
    trumpRows.set(key, row);
  }

  if (view.phase === 'bidding_round2' && pendingSuit) {
    const row = [...trumpRows.values()].find((r) => r.suit === pendingSuit);
    // The chosen suit stopped being legal out from under this screen (shouldn't happen in
    // practice — a phase change already clears pendingSuit above via the effect, which is
    // where that reset belongs, not here mid-render) — render nothing rather than stale
    // controls for a suit that's no longer legal.
    if (!row) return null;
    return (
      <div className="bid-panel" ref={panelRef} onKeyDown={onEscape(() => setPendingSuit(null))}>
        <div className="bid-panel-prompt">{row.suitLabel} is trump. With your partner hand, or alone?</div>
        {row.withPartner && (
          <button className="bid-button" onClick={() => play(row.withPartner!)}>
            With Partner
          </button>
        )}
        {row.alone && (
          <button className="bid-button bid-button-alone" onClick={() => play(row.alone!)}>
            Go Alone (4 pts)
          </button>
        )}
        <button className="bid-button bid-button-back" onClick={() => setPendingSuit(null)}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="bid-panel">
      {/* First thing a new hand shows you, before anything else — no upcard yet, no look at
          your own cards. Direct user feedback (via a playtest pass): this reads as genuinely
          disorienting the first time, since nothing on screen explains you're being asked to
          gamble with zero information on purpose. One line, not a tutorial. */}
      {view.phase === 'loner_full_blind' && (
        <div className="bid-panel-prompt">
          Nobody's seen a card yet, not even the upcard. This is the one moment you could call
          it blind.
        </div>
      )}
      {[...trumpRows.values()].map((row) =>
        view.phase === 'bidding_round2' ? (
          // Suit only here — With Partner / Alone are staged behind picking the suit first
          // (see the pendingSuit branch above), instead of every candidate suit's full set of
          // controls competing for attention at once.
          <button
            key={row.key}
            className="bid-button"
            onClick={() => setPendingSuit(row.suit)}
          >
            {`Call ${row.suitLabel}`}
          </button>
        ) : (
          <div className="bid-row" key={row.key}>
            {row.withPartner && (
              <button className="bid-button" onClick={() => play(row.withPartner!)}>
                {label(row.withPartner)}
              </button>
            )}
            {row.alone && (
              <button
                className="bid-button bid-button-alone bid-button-chip"
                onClick={() => play(row.alone!)}
                aria-label={`Go alone, ${row.suitLabel} trump (4 pts)`}
              >
                Alone
              </button>
            )}
          </div>
        ),
      )}
      {otherButtons.map((a, i) => (
        <button
          key={i}
          className="bid-button"
          onClick={() => {
            if (a.type === 'DECLARE_FULL_BLIND_LONER') setConfirmingFullBlind(true);
            else play(a);
          }}
        >
          {label(a)}
        </button>
      ))}
    </div>
  );
}
