/**
 * 牌型判定与比较 —— 服务端与客户端共用同一份实现，
 * 服务端为唯一权威，客户端仅用于预校验与提示。
 */
import type { Card } from './cards';
import { groupByRank, RANK_BIG_JOKER, RANK_LABEL, RANK_SMALL_JOKER } from './cards';

export type ComboType =
  | 'single'
  | 'pair'
  | 'trio'
  | 'trio1'
  | 'trio2'
  | 'straight'
  | 'pairStraight'
  | 'plane'
  | 'plane1'
  | 'plane2'
  | 'four2'
  | 'four2pair'
  | 'bomb'
  | 'rocket';

export interface Combo {
  type: ComboType;
  /** 主牌点数；顺子类取最大点数 */
  rank: number;
  /** 连张组数：顺子 5 张即 5 组；非连张为 1 */
  len: number;
  /** 总牌数 */
  size: number;
}

export const COMBO_NAME: Record<ComboType, string> = {
  single: '单张',
  pair: '对子',
  trio: '三张',
  trio1: '三带一',
  trio2: '三带二',
  straight: '顺子',
  pairStraight: '连对',
  plane: '飞机',
  plane1: '飞机带单',
  plane2: '飞机带对',
  four2: '四带二',
  four2pair: '四带两对',
  bomb: '炸弹',
  rocket: '王炸',
};

/** 顺子、连对、飞机不允许包含 2 与王 */
const MAX_CHAIN_RANK = 14;

function isConsecutive(ranks: number[]): boolean {
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i] !== ranks[i - 1] + 1) return false;
  }
  return true;
}

function makePlane(
  counts: Map<number, number>,
  total: number,
  trioCount: number,
  wingPerTrio: number,
): Combo | null {
  const ranks = [...counts.keys()].sort((a, b) => a - b);
  const trioCandidates = ranks.filter((r) => (counts.get(r) ?? 0) >= 3 && r <= MAX_CHAIN_RANK);
  if (trioCandidates.length < trioCount) return null;

  for (let i = 0; i + trioCount <= trioCandidates.length; i++) {
    const seq = trioCandidates.slice(i, i + trioCount);
    if (!isConsecutive(seq)) continue;

    // 计算翅膀
    const wingCounts = new Map<number, number>();
    let wingTotal = 0;
    for (const r of ranks) {
      const used = seq.includes(r) ? 3 : 0;
      const left = (counts.get(r) ?? 0) - used;
      if (left > 0) {
        wingCounts.set(r, left);
        wingTotal += left;
      }
    }
    if (wingTotal !== trioCount * wingPerTrio) continue;

    if (wingPerTrio === 2) {
      // 每个点数必须成对
      let ok = true;
      for (const c of wingCounts.values()) {
        if (c % 2 !== 0) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
    }

    return {
      type: wingPerTrio === 0 ? 'plane' : wingPerTrio === 1 ? 'plane1' : 'plane2',
      rank: seq[seq.length - 1],
      len: trioCount,
      size: total,
    };
  }
  return null;
}

/** 判定一组牌是否构成合法牌型 */
export function detectCombo(cards: Card[]): Combo | null {
  const n = cards.length;
  if (n === 0) return null;

  const groups = groupByRank(cards);
  const counts = new Map<number, number>();
  for (const [r, list] of groups) counts.set(r, list.length);
  const ranks = [...counts.keys()].sort((a, b) => a - b);
  const distinct = ranks.length;
  const maxRank = ranks[ranks.length - 1];
  const allCounts = (v: number) => ranks.every((r) => counts.get(r) === v);

  // 单张优先判定：大小王单出也是合法单牌
  if (n === 1) return { type: 'single', rank: ranks[0], len: 1, size: 1 };

  // 王炸：两张及以上全为王（大小王 / 双小王 / 两副牌四王）
  if (ranks.every((r) => r >= RANK_SMALL_JOKER)) {
    if (n >= 2) return { type: 'rocket', rank: RANK_BIG_JOKER, len: 1, size: n };
    return null;
  }

  if (distinct === 1) {
    const c = counts.get(ranks[0])!;
    if (c === 2) return { type: 'pair', rank: ranks[0], len: 1, size: 2 };
    if (c === 3) return { type: 'trio', rank: ranks[0], len: 1, size: 3 };
    if (c >= 4) return { type: 'bomb', rank: ranks[0], len: 1, size: c };
  }

  if (n === 4 && distinct === 2) {
    const trio = ranks.find((r) => counts.get(r) === 3);
    if (trio !== undefined) return { type: 'trio1', rank: trio, len: 1, size: 4 };
  }

  if (n === 5 && distinct === 2) {
    const trio = ranks.find((r) => counts.get(r) === 3);
    if (trio !== undefined) return { type: 'trio2', rank: trio, len: 1, size: 5 };
  }

  // 顺子
  if (n >= 5 && distinct === n && maxRank <= MAX_CHAIN_RANK && isConsecutive(ranks)) {
    return { type: 'straight', rank: maxRank, len: n, size: n };
  }

  // 连对
  if (n >= 6 && n % 2 === 0 && allCounts(2) && maxRank <= MAX_CHAIN_RANK && isConsecutive(ranks)) {
    return { type: 'pairStraight', rank: maxRank, len: distinct, size: n };
  }

  // 纯飞机
  if (n >= 6 && n % 3 === 0 && allCounts(3) && maxRank <= MAX_CHAIN_RANK && isConsecutive(ranks)) {
    return { type: 'plane', rank: maxRank, len: distinct, size: n };
  }

  // 四带二 / 四带两对
  if (n === 6) {
    const quad = ranks.find((r) => counts.get(r) === 4);
    if (quad !== undefined) return { type: 'four2', rank: quad, len: 1, size: 6 };
  }
  if (n === 8) {
    const quad = ranks.find((r) => counts.get(r) === 4);
    if (quad !== undefined) {
      const rest = ranks.filter((r) => r !== quad);
      if (rest.length === 2 && rest.every((r) => counts.get(r) === 2)) {
        return { type: 'four2pair', rank: quad, len: 1, size: 8 };
      }
    }
  }

  // 飞机带翅膀
  if (n >= 8 && n % 4 === 0) {
    const p = makePlane(counts, n, n / 4, 1);
    if (p) return p;
  }
  if (n >= 10 && n % 5 === 0) {
    const p = makePlane(counts, n, n / 5, 2);
    if (p) return p;
  }

  return null;
}

/** next 能否压过 prev（prev 为 null 表示自由出牌） */
export function canBeat(prev: Combo | null, next: Combo): boolean {
  if (!prev) return true;
  if (next.type === 'rocket') return prev.type !== 'rocket';
  if (prev.type === 'rocket') return false;

  if (next.type === 'bomb' && prev.type !== 'bomb') return true;
  if (prev.type === 'bomb' && next.type !== 'bomb') return false;
  if (next.type === 'bomb' && prev.type === 'bomb') {
    if (next.size !== prev.size) return next.size > prev.size;
    return next.rank > prev.rank;
  }

  if (next.type !== prev.type) return false;
  if (next.len !== prev.len) return false;
  return next.rank > prev.rank;
}

/** 用于 UI 展示的牌型描述，如「顺子 · 3-7」 */
export function describeCombo(combo: Combo): string {
  const name = COMBO_NAME[combo.type];
  if (combo.type === 'straight' || combo.type === 'pairStraight') {
    return `${name} ${RANK_LABEL[combo.rank - combo.len + 1]}-${RANK_LABEL[combo.rank]}`;
  }
  if (combo.type === 'plane' || combo.type === 'plane1' || combo.type === 'plane2') {
    return `${name} ${RANK_LABEL[combo.rank - combo.len + 1]}-${RANK_LABEL[combo.rank]}`;
  }
  if (combo.type === 'rocket') return name;
  return `${name} ${RANK_LABEL[combo.rank]}`;
}

/** 是否为炸弹类（用于倍数与音效） */
export function isBomb(combo: Combo | null): boolean {
  return !!combo && (combo.type === 'bomb' || combo.type === 'rocket');
}
