import { useCallback, useEffect, useState } from 'react';
import { api, cachedUser, setSession } from './api';
import type { UserProfile } from '../shared/types';
import { Auth } from './components/Auth';
import { Lobby } from './components/Lobby';
import { Table } from './components/Table';
import { useGame } from './game/useGame';
import { startBgm, unlockAudio } from './audio/sfx';
import { music } from './audio/music';

function initialRoom(): string | null {
  const params = new URLSearchParams(location.search);
  const r = (params.get('r') ?? params.get('room') ?? '').toUpperCase();
  return /^[A-Z0-9]{4,8}$/.test(r) ? r : null;
}

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(() => cachedUser());
  const [room, setRoom] = useState<string | null>(initialRoom);
  const [notice, setNotice] = useState<string | null>(null);

  const handleClosed = useCallback((reason: string) => {
    setNotice(reason);
    setRoom(null);
    const url = new URL(location.href);
    url.searchParams.delete('r');
    url.searchParams.delete('room');
    history.replaceState(null, '', url.toString());
  }, []);

  const session = useGame(room ?? '', user?.avatar ?? '🐯', handleClosed);

  // 校验本地会话是否仍有效
  useEffect(() => {
    if (!user) return;
    void api
      .me()
      .then((r) => {
        setUser(r.user);
        setSession(localStorage.getItem('ddz.token'), r.user);
      })
      .catch(() => {
        setSession(null, null);
        setUser(null);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 3000);
    return () => window.clearTimeout(t);
  }, [notice]);

  // 音乐：切后台暂停，回前台续播；接口异常时降级为合成 BGM
  useEffect(() => {
    music.setFallback(() => startBgm());
    music.bindVisibility();
  }, []);

  const enterRoom = useCallback((code: string) => {
    unlockAudio();
    music.unlock();
    setRoom(code);
    const url = new URL(location.href);
    url.searchParams.set('r', code);
    history.replaceState(null, '', url.toString());
  }, []);

  const leaveRoom = useCallback(() => {
    session.send({ t: 'leave' });
    setRoom(null);
    const url = new URL(location.href);
    url.searchParams.delete('r');
    history.replaceState(null, '', url.toString());
  }, [session]);

  if (!user) {
    return <Auth initialCode={room ?? undefined} onLogin={(u) => setUser(u)} />;
  }

  if (!room) {
    return (
      <>
        <Lobby
          user={user}
          onEnter={enterRoom}
          onLogout={() => {
            setSession(null, null);
            setUser(null);
          }}
          onUserChange={setUser}
        />
        {notice && <div className="toast">{notice}</div>}
      </>
    );
  }

  return (
    <>
      <Table session={session} user={user} onLeave={leaveRoom} />
      {notice && <div className="toast">{notice}</div>}
    </>
  );
}
