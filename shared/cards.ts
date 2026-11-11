/**
 * 牌模型：斗地主通用牌面表示
 * rank: 3..15 (15 = 2), 16 = 小王, 17 = 大王
 */

export type Suit = 'S' | 'H' | 'C' | 'D' | 'J';

export interface Card {
  /** 全局唯一 id，多副牌时通过 deck 序号区分 */
  id: string;
  rank: number;
  suit: Suit;
}

export const RANK_SMALL_JOKER = 16;
export const RANK_BIG_JOKER = 17;

export const RANK_LABEL: Record<number, string> = {
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
  15: '2',
  16: '小',
  17: '大',
};

export const SUIT_GLYPH: Record<Suit, string> = {
  S: '♠',
  H: '♥',
  C: '♣',
  D: '♦',
  J: '★',
};

export const SUIT_ORDER: Record<Suit, number> = { S: 0, H: 1, C: 2, D: 3, J: 4 };

/** 生成一副（或多副）牌，54 张/副 */
export function createDeck(decks = 1): Card[] {
  const out: Card[] = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of ['S', 'H', 'C', 'D'] as Suit[]) {
      for (let rank = 3; rank <= 15; rank++) {
        out.push({ id: `${suit}${rank}-${d}`, rank, suit });
      }
    }
    out.push({ id: `J${RANK_SMALL_JOKER}-${d}`, rank: RANK_SMALL_JOKER, suit: 'J' });
    out.push({ id: `J${RANK_BIG_JOKER}-${d}`, rank: RANK_BIG_JOKER, suit: 'J' });
  }
  return out;
}

/** Fisher–Yates，传入随机源便于测试复现 */
export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 手牌排序：大牌在前（左侧），同点数按花色固定顺序，视觉稳定 */
export function sortCards(cards: Card[]): Card[] {
  return cards.slice().sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    if (a.suit !== b.suit) return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
    return a.id.localeCompare(b.id);
  });
}

export function sortById(cards: Card[]): Card[] {
  return cards.slice().sort((a, b) => a.id.localeCompare(b.id));
}

export function groupByRank(cards: Card[]): Map<number, Card[]> {
  const map = new Map<number, Card[]>();
  for (const c of cards) {
    const list = map.get(c.rank);
    if (list) list.push(c);
    else map.set(c.rank, [c]);
  }
  return map;
}

export function cardName(card: Card): string {
  if (card.rank === RANK_SMALL_JOKER) return '小王';
  if (card.rank === RANK_BIG_JOKER) return '大王';
  return SUIT_GLYPH[card.suit] + RANK_LABEL[card.rank];
}

/** 取牌：按 id 从手牌中移除，返回 { rest, picked }，缺失则 picked 为 null */
export function takeCards(hand: Card[], ids: string[]): { rest: Card[]; picked: Card[] } | null {
  const wanted = new Set(ids);
  if (wanted.size !== ids.length) return null;
  const picked: Card[] = [];
  const rest: Card[] = [];
  for (const c of hand) {
    if (wanted.has(c.id)) picked.push(c);
    else rest.push(c);
  }
  if (picked.length !== ids.length) return null;
  return { rest, picked };
}
