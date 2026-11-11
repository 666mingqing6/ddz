/**
 * 组合枚举与「提示」计算。
 * 客户端点「提示」、AI 出牌、以及服务端兜底校验都基于此。
 */
import type { Card } from './cards';
import { sortCards } from './cards';
import type { Combo } from './rules';
import { canBeat, detectCombo } from './rules';

interface RankGroup {
  rank: number;
  cards: Card[];
}

function groupsOf(hand: Card[]): RankGroup[] {
  const map = new Map<number, Card[]>();
  for (const c of sortCards(hand)) {
    const list = map.get(c.rank);
    if (list) list.push(c);
    else map.set(c.rank, [c]);
  }
  return [...map.entries()]
    .map(([rank, cards]) => ({ rank, cards }))
    .sort((a, b) => a.rank - b.rank);
}

const CHAIN_MAX = 14;

/** 枚举手牌中所有可出的合法组合（有上限保护，避免 33 张牌时爆炸） */
export function enumerateCombos(hand: Card[]): Card[][] {
  const res: Card[][] = [];
  const gs = groupsOf(hand);
  const byRank = new Map(gs.map((g) => [g.rank, g.cards]));

  for (const g of gs) {
    res.push([g.cards[0]]);
    if (g.cards.length >= 2) res.push(g.cards.slice(0, 2));
    if (g.cards.length >= 3) res.push(g.cards.slice(0, 3));
    if (g.cards.length >= 4) res.push(g.cards.slice(0, 4));
    if (g.cards.length >= 5) res.push(g.cards.slice(0, 5));
  }

  // 王炸
  const small = byRank.get(16);
  const big = byRank.get(17);
  if (small && big) res.push([small[0], big[0]]);

  // 三带一 / 三带二
  for (const g of gs) {
    if (g.cards.length < 3) continue;
    const trio = g.cards.slice(0, 3);
    for (const o of gs) {
      if (o.rank === g.rank) continue;
      res.push([...trio, o.cards[0]]);
      if (o.cards.length >= 2) res.push([...trio, ...o.cards.slice(0, 2)]);
    }
  }

  // 顺子
  for (let len = 5; len <= 12; len++) {
    for (let start = 3; start + len - 1 <= CHAIN_MAX; start++) {
      const cards: Card[] = [];
      for (let r = start; r < start + len; r++) {
        const list = byRank.get(r);
        if (!list) break;
        cards.push(list[0]);
      }
      if (cards.length === len) res.push(cards);
    }
  }

  // 连对
  for (let len = 3; len <= 10; len++) {
    for (let start = 3; start + len - 1 <= CHAIN_MAX; start++) {
      const cards: Card[] = [];
      for (let r = start; r < start + len; r++) {
        const list = byRank.get(r);
        if (!list || list.length < 2) break;
        cards.push(list[0], list[1]);
      }
      if (cards.length === len * 2) res.push(cards);
    }
  }

  // 飞机（含带单、带对）
  for (let len = 2; len <= 6; len++) {
    for (let start = 3; start + len - 1 <= CHAIN_MAX; start++) {
      const core: Card[] = [];
      const usedRanks = new Set<number>();
      for (let r = start; r < start + len; r++) {
        const list = byRank.get(r);
        if (!list || list.length < 3) break;
        core.push(list[0], list[1], list[2]);
        usedRanks.add(r);
      }
      if (core.length !== len * 3) continue;
      res.push(core);

      const singles = gs
        .filter((g) => !usedRanks.has(g.rank))
        .flatMap((g) => g.cards.slice(0, 1))
        .sort((a, b) => a.rank - b.rank);
      if (singles.length >= len) res.push([...core, ...singles.slice(0, len)]);

      const pairs = gs
        .filter((g) => !usedRanks.has(g.rank) && g.cards.length >= 2)
        .sort((a, b) => a.rank - b.rank);
      if (pairs.length >= len) {
        const wings: Card[] = [];
        for (const p of pairs.slice(0, len)) wings.push(p.cards[0], p.cards[1]);
        res.push([...core, ...wings]);
      }
    }
  }

  // 四带二 / 四带两对
  for (const g of gs) {
    if (g.cards.length < 4) continue;
    const quad = g.cards.slice(0, 4);
    const restSingles = gs
      .filter((o) => o.rank !== g.rank)
      .flatMap((o) => o.cards.slice(0, 1))
      .sort((a, b) => a.rank - b.rank);
    if (restSingles.length >= 2) res.push([...quad, ...restSingles.slice(0, 2)]);
    const restPairs = gs.filter((o) => o.rank !== g.rank && o.cards.length >= 2);
    if (restPairs.length >= 2) {
      res.push([...quad, restPairs[0].cards[0], restPairs[0].cards[1], restPairs[1].cards[0], restPairs[1].cards[1]]);
    }
  }

  // 去重 + 合法性校验
  const seen = new Set<string>();
  const valid: Card[][] = [];
  for (const cards of res) {
    const key = cards.map((c) => c.id).sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    if (detectCombo(cards)) valid.push(cards);
  }
  return valid;
}

/** 找到所有能压过 prev 的出牌方案，按「代价」从低到高排序 */
export function findBeats(hand: Card[], prev: Combo | null): Card[][] {
  const combos = enumerateCombos(hand);
  const result: Card[][] = [];
  for (const cards of combos) {
    const combo = detectCombo(cards);
    if (!combo) continue;
    if (canBeat(prev, combo)) result.push(cards);
  }
  result.sort((a, b) => {
    const ca = detectCombo(a)!;
    const cb = detectCombo(b)!;
    const bombA = ca.type === 'bomb' || ca.type === 'rocket' ? 1 : 0;
    const bombB = cb.type === 'bomb' || cb.type === 'rocket' ? 1 : 0;
    if (bombA !== bombB) return bombA - bombB;
    if (ca.size !== cb.size) return ca.size - cb.size;
    return ca.rank - cb.rank;
  });
  return result;
}

/** 提示：返回下一手可出的牌；无可出则 null（应选择「不出」） */
export function suggestPlay(hand: Card[], prev: Combo | null): Card[] | null {
  const beats = findBeats(hand, prev);
  return beats.length ? beats[0] : null;
}
