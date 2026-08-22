import type { Card as CardType } from '../../shared/engine/types.ts';

function cardAsset(card: CardType): string {
  return `/art/cards/${card.suit}_${card.rank}.png`;
}

export function Card({
  card,
  onClick,
  highlighted,
  dimmed,
  mini,
  className = '',
}: {
  card: CardType;
  onClick?: () => void;
  highlighted?: boolean;
  dimmed?: boolean;
  /** Half native (50x70). Exactly half, never an in-between size, so pixels stay crisp. */
  mini?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={
        `card-face${highlighted ? ' highlighted' : ''}${dimmed ? ' dimmed' : ''}` +
        `${mini ? ' mini' : ''}${className ? ` ${className}` : ''}`
      }
    >
      <img src={cardAsset(card)} alt={`${card.rank} of ${card.suit}`} draggable={false} />
    </button>
  );
}

export function CardBack({ mini, seat }: { mini?: boolean; seat?: boolean }) {
  // `seat` swaps the ASSET, not just the box. Pixel art at a smaller size is redrawn, never
  // scaled down — rendering the 50x70 deck back into a 25x35 seat would be 0.5x, and a
  // fractional scale is the one thing this codebase now forbids outright (see --px in
  // index.css, and scripts/scale-audit.js, wired into CI as `npm run audit` since 2h.2, which
  // fails the build on it).
  return (
    <img
      className={`card-back${mini ? ' mini' : ''}${seat ? ' seat' : ''}`}
      src={seat ? '/art/card_back_seat.png' : '/art/card_back.png'}
      alt=""
      draggable={false}
    />
  );
}
