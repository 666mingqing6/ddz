/**
 * 机器人策略：轻量规则型 AI（不依赖模型，Worker 内毫秒级完成）
 * 目标不是最强，而是「像人」：会留牌、会配合队友、不会无脑炸。
 */
import type { Card } from './cards';
import { groupByRank, sortCards } from './cards';
import type { Combo } from './rules';
import { detectCombo } from './rules';
import { enumerateCombos, findBeats } from './hints';

export interface AiContext {
  mySeat: number;
  landlordSeat: number | null;
  handCounts: number[];
  lastPlaySeat: number | null;
  lowestBid?: number;
}

/** 手牌强度评估，用于叫分 */
export function handPower(hand: Card[]): number {
  const groups = groupByRank(hand);
  let score = 0;
  for (const [rank, cards] of groups) {
    if (rank === 17) score += 4;
    else if (rank === 16) score += 3;
    else if (rank === 15) score += 1.4 * cards.length;
    else if (rank === 14) score += 0.7 * cards.length;
    if (cards.length >= 4) score += 3.2;
    else if (cards.length === 3) score += 0.6;
  }
  // 顺子潜力
  const ranks = new Set(groups.keys());
  let run = 0;
  for (let r = 3; r <= 14; r++) {
    if (ranks.has(r)) run++;
    else run = 0;
    if (run >= 5) score += 0.8;
  }
  return score;
}

export function decideBid(hand: Card[], currentBid: number): number {
  const p = handPower(hand);
  let want = 0;
  if (p >= 9) want = 3;
  else if (p >= 6.5) want = 2;
  else if (p >= 4.2) want = 1;
  if (want <= currentBid) return 0;
  return want;
}

function isBombCombo(cards: Card[]): boolean {
  const c = detectCombo(cards);
  return !!c && (c.type === 'bomb' || c.type === 'rocket');
}

/** 自由出牌时的策略：优先走长牌型，保留大牌 */
function chooseLead(hand: Card[], ctx: AiContext): Card[] {
  const combos = enumerateCombos(hand);

  // 一把走完
  const finish = combos.find((c) => c.length === hand.length);
  if (finish) return finish;

  const nonBomb = combos.filter((c) => !isBombCombo(c));
  const pool = nonBomb.length ? nonBomb : combos;

  const scored = pool.map((cards) => {
    const combo = detectCombo(cards)!;
    const sizeBonus = cards.length * 2;
    const rankPenalty = combo.rank * 0.9;
    // 单张出小牌优先
    return { cards, value: sizeBonus - rankPenalty };
  });
  scored.sort((a, b) => b.value - a.value);
  return scored[0].cards;
}

/** 跟牌策略 */
function chooseFollow(hand: Card[], prev: Combo, ctx: AiContext): Card[] | null {
  const beats = findBeats(hand, prev);
  if (!beats.length) return null;

  const opponentClose = ctx.landlordSeat !== null
    ? ctx.handCounts.some((n, i) => i !== ctx.mySeat && n > 0 && n <= 2)
    : false;

  const iAmLandlord = ctx.landlordSeat === ctx.mySeat;
  const prevIsTeammate = ctx.lastPlaySeat !== null
    && !iAmLandlord
    && ctx.lastPlaySeat !== ctx.landlordSeat
    && ctx.landlordSeat !== null;

  // 队友即将走完，让牌
  if (prevIsTeammate && ctx.lastPlaySeat !== null && ctx.handCounts[ctx.lastPlaySeat] <= 2) {
    return null;
  }
  // 队友出的牌，且自己牌还多，一般不压
  if (prevIsTeammate && hand.length > 4 && prev.rank >= 13) {
    return null;
  }

  const safe = beats.filter((c) => !isBombCombo(c));
  if (safe.length) {
    // 能一把走完则直接走
    const finish = beats.find((c) => c.length === hand.length);
    if (finish) return finish;
    return safe[0];
  }

  // 只剩炸弹：对手快走完或自己也能走完才炸
  if (opponentClose) {
    const finish = beats.find((c) => c.length === hand.length);
    return finish ?? beats[0];
  }
  return null;
}

export function decidePlay(hand: Card[], prev: { combo: Combo; seat: number } | null, ctx: AiContext): Card[] | null {
  const sorted = sortCards(hand);
  if (!prev) return chooseLead(sorted, ctx);
  return chooseFollow(sorted, prev.combo, { ...ctx, lastPlaySeat: prev.seat });
}

/** 叫分/出牌兜底：超时自动动作 */
export function autoAction(
  hand: Card[],
  prev: { combo: Combo; seat: number } | null,
  ctx: AiContext,
): { type: 'play'; cards: Card[] } | { type: 'pass' } {
  const cards = decidePlay(hand, prev, ctx);
  if (cards && cards.length) return { type: 'play', cards };
  return { type: 'pass' };
}
