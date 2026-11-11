import { useState } from 'react';
import { api, setSession } from '../api';
import type { UserProfile } from '../../shared/types';
import { sfx, unlockAudio } from '../audio/sfx';
import { LogoMark } from './Logo';

const AVATARS = ['🐯', '🐼', '🦊', '🐵', '🐶', '🐷', '🐸', '🐰', '🐨', '🐻', '🦁', '🐮'];

interface Props {
  onLogin: (user: UserProfile) => void;
  initialCode?: string;
}

type Tab = 'login' | 'register' | 'guest';

export function Auth({ onLogin, initialCode }: Props) {
  const [tab, setTab] = useState<Tab>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    setBusy(true);
    unlockAudio();
    sfx.click();
    try {
      let res;
      if (tab === 'login') res = await api.login({ username, password });
      else if (tab === 'register') res = await api.register({ username, password, nickname: nickname || username, avatar });
      else res = await api.guest({ nickname: nickname || '游客', avatar });
      setSession(res.token, res.user);
      onLogin(res.user);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth__bg" />
      <div className="auth__lanterns">
        <span />
        <span />
      </div>

      <div className="auth__card">
        <LogoMark />

        {initialCode && (
          <div className="auth__invite">
            好友邀请你加入房间 <b>{initialCode}</b>，登录后自动进入
          </div>
        )}

        <div className="tabs">
          <button className={tab === 'login' ? 'is-active' : ''} onClick={() => setTab('login')}>登录</button>
          <button className={tab === 'register' ? 'is-active' : ''} onClick={() => setTab('register')}>注册</button>
          <button className={tab === 'guest' ? 'is-active' : ''} onClick={() => setTab('guest')}>游客</button>
        </div>

        <div className="form">
          {tab !== 'guest' && (
            <>
              <label>
                <span>用户名</span>
                <input
                  value={username}
                  autoComplete="username"
                  placeholder="3-16 位字母、数字或下划线"
                  onChange={(e) => setUsername(e.target.value.trim())}
                />
              </label>
              <label>
                <span>密码</span>
                <input
                  type="password"
                  value={password}
                  autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                  placeholder="至少 6 位"
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void submit()}
                />
              </label>
            </>
          )}

          {tab !== 'login' && (
            <>
              <label>
                <span>昵称</span>
                <input
                  value={nickname}
                  maxLength={12}
                  placeholder={tab === 'guest' ? '给自己起个名字' : '牌桌上显示的名字'}
                  onChange={(e) => setNickname(e.target.value)}
                />
              </label>
              <div className="avatar-picker">
                <span>头像</span>
                <div className="avatar-picker__list">
                  {AVATARS.map((a) => (
                    <button key={a} className={a === avatar ? 'is-active' : ''} onClick={() => setAvatar(a)}>
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {err && <div className="form__err">{err}</div>}

          <button className="btn btn--primary btn--block" disabled={busy} onClick={() => void submit()}>
            {busy ? '请稍候…' : tab === 'login' ? '进入牌桌' : tab === 'register' ? '注册并进入' : '以游客身份进入'}
          </button>

          <p className="form__hint">
            {tab === 'guest' ? '游客账号 7 天内有效，注册后可长期保存战绩' : '账号仅用于保存战绩与金币，不会收集其他信息'}
          </p>
        </div>
      </div>
    </div>
  );
}
