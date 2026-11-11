import { describe, expect, it } from 'vitest';
import type { Card } from '../shared/cards';
import { createDeck, sortCards } from '../shared/cards';
import { canBeat, detectCombo, isBomb } from '../shared/rules';
import { findBeats, enumerateCombos } from '../shared/hints';
import { decideBid, decidePlay } from '../shared/ai';
import { VARIANTS } from '../shared/types';

/** 用 "3S" / "10H" / "16J" 这类简写构造牌 */
function C(...specs: string[]): Card[] {
  return specs.map((s, i) => {
    const rank = Number(s.slice(0, -1));
    const suit = s.slice(-1) as Card['suit'];
    return { id: `${s}-${i}`, rank, suit };
  });
}

describe('牌型判定', () => {
  it('基础牌型', () => {
    expect(detectCombo(C('3S'))?.type).toBe('single');
    expect(detectCombo(C('3S', '3H'))?.type).toBe('pair');
    expect(detectCombo(C('3S', '3H', '3C'))?.type).toBe('trio');
    expect(detectCombo(C('3S', '3H', '3C', '5D'))?.type).toBe('trio1');
    expect(detectCombo(C('3S', '3H', '3C', '5D', '5S'))?.type).toBe('trio2');
    expect(detectCombo(C('3S', '3H', '3C', '3D'))?.type).toBe('bomb');
    expect(detectCombo(C('16J', '17J'))?.type).toBe('rocket');
  });

  it('顺子 / 连对 / 飞机', () => {
    expect(detectCombo(C('3S', '4H', '5C', '6D', '7S'))?.type).toBe('straight');
    expect(detectCombo(C('3S', '4H', '5C', '6D'))).toBeNull();
    // 顺子不能含 2
    expect(detectCombo(C('11S', '12H', '13C', '14D', '15S'))).toBeNull();
    expect(detectCombo(C('3S', '3H', '4C', '4D', '5S', '5H'))?.type).toBe('pairStraight');
    expect(detectCombo(C('3S', '3H', '3C', '4D', '4S', '4H'))?.type).toBe('plane');
    expect(detectCombo(C('3S', '3H', '3C', '4D', '4S', '4H', '7C', '9D'))?.type).toBe('plane1');
    expect(
      detectCombo(C('3S', '3H', '3C', '4D', '4S', '4H', '7C', '7D', '9C', '9D'))?.type,
    ).toBe('plane2');
  });

  it('四带二', () => {
    expect(detectCombo(C('3S', '3H', '3C', '3D', '7S', '9H'))?.type).toBe('four2');
    expect(detectCombo(C('3S', '3H', '3C', '3D', '7S', '7H', '9S', '9H'))?.type).toBe('four2pair');
  });

  it('非法组合', () => {
    expect(detectCombo(C('3S', '4H'))).toBeNull();
    expect(detectCombo(C('3S', '3H', '4C', '5D', '6S'))).toBeNull();
    expect(detectCombo([])).toBeNull();
  });

  it('大小王单出与王炸', () => {
    expect(detectCombo(C('16J'))?.type).toBe('single');
    expect(detectCombo(C('17J'))?.type).toBe('single');
    expect(detectCombo(C('16J', '17J'))?.type).toBe('rocket');
    // 单大王压单小王
    expect(canBeat(detectCombo(C('16J'))!, detectCombo(C('17J'))!)).toBe(true);
    expect(canBeat(detectCombo(C('17J'))!, detectCombo(C('16J'))!)).toBe(false);
  });
});

describe('大小比较', () => {
  const single3 = detectCombo(C('3S'))!;
  const singleA = detectCombo(C('14S'))!;
  const bomb = detectCombo(C('3S', '3H', '3C', '3D'))!;
  const rocket = detectCombo(C('16J', '17J'))!;

  it('同型比点数', () => {
    expect(canBeat(single3, singleA)).toBe(true);
    expect(canBeat(singleA, single3)).toBe(false);
    expect(canBeat(null, single3)).toBe(true);
  });

  it('炸弹与王炸', () => {
    expect(canBeat(singleA, bomb)).toBe(true);
    expect(canBeat(bomb, singleA)).toBe(false);
    expect(canBeat(bomb, rocket)).toBe(true);
    expect(canBeat(rocket, bomb)).toBe(false);
    expect(isBomb(bomb)).toBe(true);
    expect(isBomb(rocket)).toBe(true);
  });

  it('牌型不同不可压', () => {
    const pair = detectCombo(C('3S', '3H'))!;
    expect(canBeat(pair, singleA)).toBe(false);
  });

  it('顺子长度必须一致', () => {
    const s5 = detectCombo(C('3S', '4H', '5C', '6D', '7S'))!;
    const s6 = detectCombo(C('3S', '4H', '5C', '6D', '7S', '8H'))!;
    expect(canBeat(s5, s6)).toBe(false);
  });
});

describe('发牌配置', () => {
  it('各人数牌数守恒', () => {
    for (const key of [2, 3, 4]) {
      const v = VARIANTS[key];
      const deck = createDeck(v.decks);
      expect(deck.length).toBe(54 * v.decks);
      expect(v.handSize * v.players + v.bottom).toBe(deck.length);
    }
  });

  it('两副牌 id 唯一', () => {
    const deck = createDeck(2);
    expect(new Set(deck.map((c) => c.id)).size).toBe(deck.length);
  });
});

describe('提示与 AI', () => {
  it('能找到能压过的牌', () => {
    const hand = C('3S', '3H', '9C', '9D', '14S', '15H', '16J', '17J');
    const prev = detectCombo(C('8S', '8H'))!;
    const beats = findBeats(hand, prev);
    expect(beats.length).toBeGreaterThan(0);
    expect(beats.every((b) => detectCombo(b))).toBe(true);
  });

  it('枚举结果全部合法', () => {
    const hand = sortCards(createDeck(1).slice(0, 17));
    const combos = enumerateCombos(hand);
    expect(combos.length).toBeGreaterThan(0);
    for (const c of combos) expect(detectCombo(c)).not.toBeNull();
  });

  it('提示包含单张王', () => {
    const hand = C('16J', '17J');
    const beats = findBeats(hand, detectCombo(C('14S'))!);
    const singles = beats.filter((b) => detectCombo(b)?.type === 'single');
    expect(singles.length).toBe(2);
  });

  it('AI 决策不抛异常', () => {
    const hand = sortCards(createDeck(1).slice(0, 17));
    expect([0, 1, 2, 3]).toContain(decideBid(hand, 0));
    const play = decidePlay(hand, null, {
      mySeat: 0,
      landlordSeat: 0,
      handCounts: [17, 17, 17],
      lastPlaySeat: null,
    });
    expect(play && play.length > 0).toBe(true);
  });
});
