import { memo } from 'react';
import type { Card } from '../../shared/cards';
import { RANK_LABEL, SUIT_GLYPH } from '../../shared/cards';

interface Props {
  card?: Card;
  faceDown?: boolean;
  selected?: boolean;
  small?: boolean;
  mini?: boolean;
  dim?: boolean;
  style?: React.CSSProperties;
  onClick?: () => void;
  className?: string;
}

function CardViewInner({ card, faceDown, selected, small, mini, dim, style, onClick, className = '' }: Props) {
  if (faceDown || !card) {
    return <div className={`card card--back ${small ? 'card--sm' : ''} ${mini ? 'card--mini' : ''} ${className}`} style={style} />;
  }

  const isJoker = card.rank >= 16;
  const red = card.suit === 'H' || card.suit === 'D' || card.rank === 17;
  const label = RANK_LABEL[card.rank];
  const glyph = isJoker ? '★' : SUIT_GLYPH[card.suit];

  return (
    <div
      className={[
        'card',
        red ? 'card--red' : 'card--black',
        isJoker ? 'card--joker' : '',
        selected ? 'is-selected' : '',
        small ? 'card--sm' : '',
        mini ? 'card--mini' : '',
        dim ? 'is-dim' : '',
        onClick ? 'is-clickable' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      aria-label={isJoker ? (card.rank === 17 ? '大王' : '小王') : `${glyph}${label}`}
    >
      {isJoker ? (
        <>
          <span className="card__joker-tag">{card.rank === 17 ? '大' : '小'}</span>
          <span className="card__joker-word">JOKER</span>
          <span className="card__joker-star">{glyph}</span>
        </>
      ) : (
        <>
          <span className="card__corner">
            <b>{label}</b>
            <i>{glyph}</i>
          </span>
          <span className="card__pip">{glyph}</span>
          <span className="card__corner card__corner--br">
            <b>{label}</b>
            <i>{glyph}</i>
          </span>
        </>
      )}
    </div>
  );
}

export const CardView = memo(CardViewInner);
