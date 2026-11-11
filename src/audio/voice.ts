/**
 * 语音播报：使用 Web Speech API（系统中文语音），无外部依赖、零流量。
 * 播报内容与欢乐斗地主一致：出牌牌型、不要、叫分、胜负、快捷语。
 */
import type { Combo } from '../../shared/rules';
import { audioSettings } from './sfx';

const RANK_SPEECH: Record<number, string> = {
  3: '三',
  4: '四',
  5: '五',
  6: '六',
  7: '七',
  8: '八',
  9: '九',
  10: '十',
  11: '勾',
  12: '圈',
  13: '凯',
  14: '尖',
  15: '二',
  16: '小王',
  17: '大王',
};

let picked: SpeechSynthesisVoice | null = null;
let primed = false;

function supported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (!supported()) return null;
  if (picked) return picked;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const zh = voices.filter((v) => /zh|cmn|Chinese/i.test(v.lang) || /中文|普通话/.test(v.name));
  const prefer = ['Xiaoxiao', 'Xiaoyi', 'Huihui', 'Yaoyao', 'Tingting', 'Meijia', '女'];
  picked =
    zh.find((v) => prefer.some((p) => v.name.includes(p))) ??
    zh[0] ??
    voices.find((v) => /zh/i.test(v.lang)) ??
    null;
  return picked;
}

/** 首次用户手势后调用，预取语音列表并放一次静音，避免首句被丢弃 */
export function unlockVoice(): void {
  if (!supported() || primed) return;
  primed = true;
  try {
    window.speechSynthesis.getVoices();
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    u.lang = 'zh-CN';
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
  window.speechSynthesis.onvoiceschanged = () => {
    picked = null;
    pickVoice();
  };
}

function speak(text: string, opts: { rate?: number; pitch?: number; volume?: number } = {}): void {
  if (!supported() || !audioSettings().voice || !text) return;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = opts.rate ?? 1.05;
    u.pitch = opts.pitch ?? 1.25;
    u.volume = opts.volume ?? 1;
    const v = pickVoice();
    if (v) {
      // 某些环境返回的 voice 对象不合法，赋值会抛错；单独兜住，避免整句丢失
      try {
        u.voice = v;
        if (v.lang) u.lang = v.lang;
      } catch {
        /* 使用默认语音 */
      }
    }
    synth.speak(u);
  } catch {
    /* 无语音环境时静默 */
  }
}

export function comboSpeech(combo: Combo): string {
  const r = RANK_SPEECH[combo.rank] ?? '';
  switch (combo.type) {
    case 'single':
      return r;
    case 'pair':
      return `对${r}`;
    case 'trio':
      return `三个${r}`;
    case 'trio1':
      return '三带一';
    case 'trio2':
      return '三带一对';
    case 'straight':
      return '顺子';
    case 'pairStraight':
      return '连对';
    case 'plane':
      return '飞机';
    case 'plane1':
      return '飞机带单';
    case 'plane2':
      return '飞机带对';
    case 'four2':
      return '四带二';
    case 'four2pair':
      return '四带两对';
    case 'bomb':
      return '炸弹';
    case 'rocket':
      return '王炸';
    default:
      return '出牌';
  }
}

export function announcePlay(combo: Combo): void {
  if (combo.type === 'bomb') speak('炸弹', { rate: 0.95, pitch: 1.1 });
  else if (combo.type === 'rocket') speak('王炸', { rate: 0.95, pitch: 1.1 });
  else speak(comboSpeech(combo));
}

export function announcePass(): void {
  speak('不要', { rate: 1.15 });
}

export function announceBid(score: number): void {
  const label: Record<number, string> = { 0: '不叫', 1: '一分', 2: '两分', 3: '三分' };
  speak(label[score] ?? '不叫', { rate: 1.1 });
}

export function announceLandlord(): void {
  speak('我是地主', { rate: 1.05, pitch: 1.2 });
}

export function announceResult(win: boolean, spring: boolean): void {
  if (win) speak(spring ? '春天，胜利' : '胜利', { rate: 1, pitch: 1.3 });
  else speak('失败', { rate: 0.95, pitch: 0.95 });
}

/** 快捷语：去掉标点后播报，过长则截断 */
export function announceChat(text: string): void {
  const clean = text.replace(/[，。！？、,.!?~～]/g, '');
  speak(clean.slice(0, 24), { rate: 1.1, pitch: 1.2 });
}

export function stopVoice(): void {
  if (!supported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}
