import type { Card as CardType } from '../../shared/engine/types.ts';

function cardAsset(card: CardType): string {
  return `/art/cards/${card.suit}_${card.rank}.png`;
}

export function Card({
  card,
  onClick,
  highlighted,
  dimmed,
}: {
  card: CardType;
  onClick?: () => void;
  highlighted?: boolean;
  dimmed?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`card-face${highlighted ? ' highlighted' : ''}${dimmed ? ' dimmed' : ''}`}
    >
      <img src={cardAsset(card)} alt={`${card.rank} of ${card.suit}`} draggable={false} />
    </button>
  );
}

export function CardBack({ mini }: { mini?: boolean }) {
  return (
    <img
      className={`card-back${mini ? ' mini' : ''}`}
      src="/art/card_back.png"
      alt=""
      draggable={false}
    />
  );
}
