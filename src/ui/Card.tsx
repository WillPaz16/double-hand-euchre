import type { Card as CardType } from '../../shared/engine/types.ts';

const SUIT_SYMBOL: Record<CardType['suit'], string> = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
};
const RED_SUITS = new Set<CardType['suit']>(['diamonds', 'hearts']);

export function Card({
  card,
  onClick,
  highlighted,
}: {
  card: CardType;
  onClick?: () => void;
  highlighted?: boolean;
}) {
  const red = RED_SUITS.has(card.suit);
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`card-face${red ? ' red' : ''}${highlighted ? ' highlighted' : ''}`}
    >
      <span>{card.rank}</span>
      <span className="pip">{SUIT_SYMBOL[card.suit]}</span>
    </button>
  );
}

export function CardBack() {
  return <div className="card-back" />;
}
