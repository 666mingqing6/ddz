/**
 * 背景音乐：通过自建 Meting API 播放网易云《欢乐斗地主配乐合集》。
 * - 分场景：大厅 / 对局 / 激烈 / 胜利 / 失败
 * - 淡入淡出、自动轮播、失败降级为合成音
 * - 浏览器自动播放策略：需在首次用户手势后调用 unlock()
 */

const API = 'https://meting-api.646474.xyz/api';

export type MusicMode = 'off' | 'lobby' | 'game' | 'tense' | 'win' | 'lose';

/** 网易云歌曲 ID（小旭音乐《欢乐斗地主配乐合集》） */
export const TRACKS = {
  lobby: [2163889758, 2163888609], // 游戏中1 / 游戏中2
  game: [2163888609, 2163889759, 2163889758], // 游戏中2 / 游戏中3 / 游戏中1
  tense: [2163888604, 2163888605], // 激烈1 / 激烈2
  win: [2163888606, 2163888607], // 胜利1 / 胜利2
  lose: [2163889757], // 失败1
} as const;

const ONESHOT: Record<MusicMode, boolean> = {
  off: false,
  lobby: false,
  game: false,
  tense: false,
  win: true,
  lose: true,
};

const VOLUME: Record<MusicMode, number> = {
  off: 0,
  lobby: 0.3,
  game: 0.34,
  tense: 0.4,
  win: 0.5,
  lose: 0.5,
};

function trackUrl(id: number): string {
  return `${API}?server=netease&type=url&id=${id}`;
}

class MusicPlayer {
  private el: HTMLAudioElement | null = null;
  private mode: MusicMode = 'off';
  private index = 0;
  private enabled = true;
  private unlocked = false;
  private fadeTimer: number | null = null;
  private failed = false;
  private fallback: (() => void) | null = null;

  private ensure(): HTMLAudioElement | null {
    if (typeof window === 'undefined') return null;
    if (!this.el) {
      const el = new Audio();
      el.preload = 'auto';
      el.volume = 0;
      el.addEventListener('ended', () => this.next());
      el.addEventListener('error', () => this.onError());
      this.el = el;
    }
    return this.el;
  }

  setFallback(fn: () => void): void {
    this.fallback = fn;
  }

  private onError(): void {
    if (this.failed) return;
    this.failed = true;
    // 网络或版权限制导致无法播放时，退回合成 BGM
    this.fallback?.();
  }

  private fadeTo(target: number, ms = 500): void {
    const el = this.ensure();
    if (!el) return;
    if (this.fadeTimer) window.clearInterval(this.fadeTimer);
    const start = el.volume;
    const steps = Math.max(1, Math.round(ms / 40));
    let i = 0;
    this.fadeTimer = window.setInterval(() => {
      i += 1;
      const v = start + ((target - start) * i) / steps;
      el.volume = Math.min(1, Math.max(0, v));
      if (i >= steps) {
        if (this.fadeTimer) window.clearInterval(this.fadeTimer);
        this.fadeTimer = null;
        if (target === 0) el.pause();
      }
    }, 40);
  }

  private playCurrent(): void {
    const el = this.ensure();
    if (!el) return;
    const list = TRACKS[this.mode as keyof typeof TRACKS];
    if (!list || !list.length) return;
    const id = list[this.index % list.length];
    el.src = trackUrl(id);
    el.loop = false;
    el.volume = 0;
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(() => undefined);
    this.fadeTo(VOLUME[this.mode], 700);
  }

  private next(): void {
    const list = TRACKS[this.mode as keyof typeof TRACKS];
    if (!list) return;
    if (this.mode === 'win' || this.mode === 'lose') {
      // 一次性音效播完回到大厅音乐
      this.setMode('lobby', true);
      return;
    }
    this.index = (this.index + 1) % list.length;
    this.playCurrent();
  }

  unlock(): void {
    this.unlocked = true;
    const el = this.ensure();
    if (el && el.paused && this.mode !== 'off' && this.enabled) this.playCurrent();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    const el = this.ensure();
    if (!el) return;
    if (!on) {
      this.fadeTo(0, 300);
      return;
    }
    // 重新开启时允许重试（此前可能因网络失败降级过）
    this.failed = false;
    if (this.mode !== 'off' && this.unlocked) this.playCurrent();
  }

  setMode(mode: MusicMode, force = false): void {
    if (!force && mode === this.mode) return;
    const prev = this.mode;
    this.mode = mode;
    if (mode === 'off') {
      this.fadeTo(0, 300);
      return;
    }
    if (!this.enabled || !this.unlocked) return;
    if (prev !== 'off' && prev !== mode) {
      // 先淡出再切歌，避免突兀
      const el = this.ensure();
      if (el && !el.paused) {
        this.fadeTo(0, 260);
        window.setTimeout(() => {
          if (this.mode === mode) this.playCurrent();
        }, 280);
        return;
      }
    }
    this.index = 0;
    this.playCurrent();
  }

  /** 紧张度提升：倍数高或手牌少时切到激烈曲目 */
  setTension(high: boolean): void {
    if (this.mode === 'game' || this.mode === 'tense') {
      this.setMode(high ? 'tense' : 'game');
    }
  }

  currentMode(): MusicMode {
    return this.mode;
  }

  /** 页面隐藏时暂停，回来继续 */
  bindVisibility(): void {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => {
      const el = this.ensure();
      if (!el) return;
      if (document.hidden) el.pause();
      else if (this.mode !== 'off' && this.enabled && this.unlocked) {
        const p = el.play();
        if (p && typeof p.catch === 'function') p.catch(() => undefined);
      }
    });
  }
}

export const music = new MusicPlayer();

export function metingSongUrl(id: number): string {
  return trackUrl(id);
}
