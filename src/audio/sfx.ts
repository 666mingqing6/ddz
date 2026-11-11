/**
 * 音效与背景音乐：全部用 Web Audio 实时合成。
 * 不依赖任何外部音频文件 —— 规避版权、零请求、首屏即响。
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxGain: GainNode | null = null;
let bgmGain: GainNode | null = null;
let bgmTimer: number | null = null;
let bgmStep = 0;

const SETTINGS_KEY = 'ddz.audio';

interface AudioSettings {
  sfx: boolean;
  bgm: boolean;
}

export function audioSettings(): AudioSettings {
  try {
    return { sfx: true, bgm: true, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<AudioSettings>) };
  } catch {
    return { sfx: true, bgm: true };
  }
}

export function setAudioSettings(patch: Partial<AudioSettings>): AudioSettings {
  const next = { ...audioSettings(), ...patch };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  if (master) {
    if (sfxGain) sfxGain.gain.value = next.sfx ? 0.9 : 0;
    if (bgmGain) bgmGain.gain.value = next.bgm ? 0.28 : 0;
  }
  if (next.bgm) startBgm();
  else stopBgm();
  return next;
}

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = audioSettings().sfx ? 0.9 : 0;
    sfxGain.connect(master);
    bgmGain = ctx.createGain();
    bgmGain.gain.value = audioSettings().bgm ? 0.28 : 0;
    bgmGain.connect(master);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function unlockAudio(): void {
  ensure();
}

function env(node: AudioNode, t0: number, attack: number, decay: number, peak = 1): GainNode {
  const c = ctx!;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  node.connect(g);
  g.connect(sfxGain!);
  return g;
}

function tone(freq: number, t0: number, dur: number, type: OscillatorType = 'sine', peak = 0.5, slideTo?: number): void {
  const c = ensure();
  if (!c || !sfxGain || sfxGain.gain.value === 0) return;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  env(osc, t0, 0.008, dur, peak);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(t0: number, dur: number, filterFreq: number, peak = 0.4, type: BiquadFilterType = 'bandpass'): void {
  const c = ensure();
  if (!c || !sfxGain || sfxGain.gain.value === 0) return;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(filterFreq, t0);
  filter.Q.value = 1.2;
  src.connect(filter);
  env(filter, t0, 0.005, dur, peak);
  src.start(t0);
}

export const sfx = {
  click(): void {
    const c = ensure();
    if (!c) return;
    tone(880, c.currentTime, 0.06, 'triangle', 0.25, 1200);
  },
  deal(): void {
    const c = ensure();
    if (!c) return;
    for (let i = 0; i < 6; i++) noise(c.currentTime + i * 0.045, 0.08, 2600 + Math.random() * 900, 0.18);
  },
  play(): void {
    const c = ensure();
    if (!c) return;
    noise(c.currentTime, 0.12, 1800, 0.35);
    tone(520, c.currentTime, 0.08, 'triangle', 0.18, 720);
  },
  pass(): void {
    const c = ensure();
    if (!c) return;
    tone(220, c.currentTime, 0.16, 'sine', 0.22, 160);
  },
  select(): void {
    const c = ensure();
    if (!c) return;
    tone(1040, c.currentTime, 0.04, 'square', 0.1);
  },
  bomb(): void {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    tone(120, t, 0.55, 'sawtooth', 0.55, 32);
    noise(t, 0.5, 420, 0.55, 'lowpass');
    tone(70, t + 0.02, 0.7, 'sine', 0.45, 28);
  },
  rocket(): void {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    tone(400, t, 0.35, 'sawtooth', 0.3, 1800);
    tone(120, t + 0.3, 0.6, 'sawtooth', 0.5, 30);
    noise(t + 0.3, 0.5, 400, 0.5, 'lowpass');
  },
  win(): void {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, t + i * 0.12, 0.4, 'triangle', 0.35));
    tone(1318.5, t + 0.5, 0.6, 'sine', 0.25);
  },
  lose(): void {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    [392, 349.23, 293.66, 246.94].forEach((f, i) => tone(f, t + i * 0.16, 0.35, 'triangle', 0.3));
  },
  turn(): void {
    const c = ensure();
    if (!c) return;
    tone(1320, c.currentTime, 0.1, 'sine', 0.2);
    tone(1760, c.currentTime + 0.09, 0.12, 'sine', 0.15);
  },
  bid(score: number): void {
    const c = ensure();
    if (!c) return;
    if (score === 0) {
      tone(300, c.currentTime, 0.12, 'sine', 0.18, 220);
    } else {
      for (let i = 0; i < score; i++) tone(660 + i * 180, c.currentTime + i * 0.07, 0.12, 'triangle', 0.25);
    }
  },
};

// ---------------------------------------------------------------- 背景音乐
// 五声音阶循环，古筝感的拨弦音色（triangle + 快速衰减）
const MELODY = [
  523.25, 587.33, 659.25, 783.99, 659.25, 587.33, 523.25, 392.0,
  440.0, 523.25, 587.33, 523.25, 440.0, 392.0, 440.0, 523.25,
];
const BASS = [130.81, 130.81, 174.61, 174.61, 196.0, 196.0, 164.81, 164.81];

function bgmTick(): void {
  const c = ensure();
  if (!c || !bgmGain) return;
  const t = c.currentTime + 0.02;
  const note = MELODY[bgmStep % MELODY.length];
  const bass = BASS[Math.floor(bgmStep / 2) % BASS.length];

  const o = c.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(note, t);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  o.connect(g);
  g.connect(bgmGain);
  o.start(t);
  o.stop(t + 0.55);

  if (bgmStep % 2 === 0) {
    const b = c.createOscillator();
    b.type = 'sine';
    b.frequency.setValueAtTime(bass, t);
    const bg = c.createGain();
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    b.connect(bg);
    bg.connect(bgmGain);
    b.start(t);
    b.stop(t + 0.95);
  }
  bgmStep++;
}

export function startBgm(): void {
  if (!audioSettings().bgm) return;
  const c = ensure();
  if (!c || bgmTimer !== null) return;
  bgmTick();
  bgmTimer = window.setInterval(bgmTick, 480);
}

export function stopBgm(): void {
  if (bgmTimer !== null) {
    window.clearInterval(bgmTimer);
    bgmTimer = null;
  }
}
