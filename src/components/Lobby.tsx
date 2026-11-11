import { useCallback, useEffect, useState } from 'react';
import { api, setSession } from '../api';
import type { RoomSummary, UserProfile } from '../../shared/types';
import { audioSettings, setAudioSettings, sfx, startBgm, unlockAudio } from '../audio/sfx';
import { music } from '../audio/music';
import { LogoMark } from './Logo';

interface Props {
  user: UserProfile;
  onEnter: (code: string) => void;
  onLogout: () => void;
  onUserChange: (u: UserProfile) => void;
}

const BASE_OPTIONS = [5, 10, 20, 50];
const TIME_OPTIONS = [15, 25, 40];

export function Lobby({ user, onEnter, onLogout, onUserChange }: Props) {
  const [players, setPlayers] = useState(3);
  const [baseScore, setBaseScore] = useState(10);
  const [turnSeconds, setTurnSeconds] = useState(25);
  const [botFill, setBotFill] = useState(true);
  const [code, setCode] = useState('');
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [audio, setAudio] = useState(audioSettings());

  const load = useCallback(async () => {
    try {
      const res = await api.rooms();
      setRooms(res.rooms);
    } catch {
      /* 忽略轮询失败 */
    }
  }, []);

  useEffect(() => {
    void load();
    void api.me().then((r) => onUserChange(r.user)).catch(() => undefined);
    const t = window.setInterval(() => void load(), 8000);
    return () => window.clearInterval(t);
  }, [load, onUserChange]);

  useEffect(() => {
    // 真实配乐优先，接口不可用时降级为合成 BGM
    music.setFallback(() => startBgm());
    music.setEnabled(audioSettings().bgm);
    music.setMode('lobby');
    const onFirst = () => {
      unlockAudio();
      music.unlock();
      window.removeEventListener('pointerdown', onFirst);
    };
    window.addEventListener('pointerdown', onFirst);
    return () => window.removeEventListener('pointerdown', onFirst);
  }, []);

  async function create() {
    setBusy(true);
    setErr(null);
    unlockAudio();
    sfx.click();
    try {
      const res = await api.createRoom({ players, baseScore, turnSeconds, botFill });
      onEnter(res.code);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '创建房间失败');
    } finally {
      setBusy(false);
    }
  }

  function join(target?: string) {
    const c = (target ?? code).trim().toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(c)) {
      setErr('请输入 4-8 位房间号');
      return;
    }
    sfx.click();
    onEnter(c);
  }

  const winRate = user.wins + user.losses > 0 ? Math.round((user.wins / (user.wins + user.losses)) * 100) : 0;

  return (
    <div className="lobby">
      <div className="lobby__bg" />
      <header className="lobby__top">
        <LogoMark small />
        <div className="lobby__spacer" />
        <button
          className="hud__btn"
          title="音效"
          onClick={() => {
            const next = setAudioSettings({ sfx: !audio.sfx });
            setAudio(next);
            sfx.click();
          }}
        >
          {audio.sfx ? '🔊' : '🔇'}
        </button>
        <button
          className="hud__btn"
          title="背景音乐"
          onClick={() => {
            const next = setAudioSettings({ bgm: !audio.bgm });
            setAudio(next);
            music.setEnabled(next.bgm);
          }}
        >
          {audio.bgm ? '🎵' : '🎶'}
        </button>
        <button className="hud__btn" onClick={onLogout} title="退出登录">
          ⎋
        </button>
      </header>

      <div className="lobby__body">
        <section className="profile-card">
          <div className="profile-card__avatar">{user.avatar}</div>
          <div className="profile-card__info">
            <h2>{user.nickname}</h2>
            <p className="profile-card__id">@{user.username || '游客'}</p>
          </div>
          <div className="profile-card__coins">
            <span>🪙</span>
            <b>{user.coins.toLocaleString()}</b>
          </div>
          <div className="profile-card__stats">
            <div><b>{user.wins}</b><span>胜</span></div>
            <div><b>{user.losses}</b><span>负</span></div>
            <div><b>{winRate}%</b><span>胜率</span></div>
          </div>
        </section>

        <div className="lobby__grid">
          <section className="panel">
            <h3>创建房间</h3>
            <div className="field">
              <span>人数</span>
              <div className="seg">
                {[2, 3, 4].map((n) => (
                  <button key={n} className={players === n ? 'is-active' : ''} onClick={() => setPlayers(n)}>
                    {n} 人
                  </button>
                ))}
              </div>
            </div>
            <p className="field__note">
              {players === 3 ? '经典玩法：一副牌 17 张，3 张底牌' : players === 4 ? '四人玩法：两副牌 25 张，8 张底牌' : '双人玩法：一副牌 17 张，20 张底牌全归地主'}
            </p>
            <div className="field">
              <span>底分</span>
              <div className="seg">
                {BASE_OPTIONS.map((n) => (
                  <button key={n} className={baseScore === n ? 'is-active' : ''} onClick={() => setBaseScore(n)}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span>出牌时限</span>
              <div className="seg">
                {TIME_OPTIONS.map((n) => (
                  <button key={n} className={turnSeconds === n ? 'is-active' : ''} onClick={() => setTurnSeconds(n)}>
                    {n} 秒
                  </button>
                ))}
              </div>
            </div>
            <label className="switch">
              <input type="checkbox" checked={botFill} onChange={(e) => setBotFill(e.target.checked)} />
              <span>空位由机器人补足</span>
            </label>
            {err && <div className="form__err">{err}</div>}
            <button className="btn btn--primary btn--block" disabled={busy} onClick={() => void create()}>
              {busy ? '创建中…' : '创建房间'}
            </button>
          </section>

          <section className="panel">
            <h3>加入房间</h3>
            <div className="join">
              <input
                value={code}
                maxLength={8}
                placeholder="输入房间号，如 A8K2M"
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && join()}
              />
              <button className="btn btn--gold" onClick={() => join()}>加入</button>
            </div>
            <p className="field__note">把房间号或链接发给好友，即可实时对战</p>

            <h3 className="panel__sub">正在等待的房间</h3>
            <div className="rooms">
              {rooms.length === 0 && <p className="rooms__empty">暂时没有公开房间，创建一个吧</p>}
              {rooms.map((r) => (
                <div key={r.code} className="rooms__item">
                  <div className="rooms__code">{r.code}</div>
                  <div className="rooms__meta">
                    <span>{r.hostName || '匿名'} 的房间</span>
                    <span className="rooms__tag">{r.capacity} 人 · 底分 {r.baseScore}</span>
                  </div>
                  <div className={`rooms__status ${r.status}`}>
                    {r.status === 'playing' ? '游戏中' : `${r.players}/${r.capacity}`}
                  </div>
                  <button className="btn btn--sm btn--ghost" onClick={() => join(r.code)}>进入</button>
                </div>
              ))}
            </div>
          </section>
        </div>

        <footer className="lobby__foot">
          <span>服务端权威判定 · 断线重连 · 实时对战</span>
          <span>Cloudflare Workers + Durable Objects + D1</span>
        </footer>
      </div>
    </div>
  );
}

export function clearSession(): void {
  setSession(null, null);
}
