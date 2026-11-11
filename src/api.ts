import type { RoomSummary, UserProfile } from '../shared/types';

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

export interface AuthResult {
  token: string;
  user: UserProfile;
}

function token(): string | null {
  return localStorage.getItem('ddz.token');
}

export function setSession(token: string | null, user: UserProfile | null): void {
  if (token) localStorage.setItem('ddz.token', token);
  else localStorage.removeItem('ddz.token');
  if (user) localStorage.setItem('ddz.user', JSON.stringify(user));
  else localStorage.removeItem('ddz.user');
}

export function cachedUser(): UserProfile | null {
  try {
    const raw = localStorage.getItem('ddz.user');
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  const t = token();
  if (t) headers.set('authorization', `Bearer ${t}`);
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } & T;
  if (!res.ok || data.ok === false) throw new Error(data.error ?? `请求失败 (${res.status})`);
  return data;
}

export const api = {
  register: (body: { username: string; password: string; nickname: string; avatar: string }) =>
    request<AuthResult & { ok: true }>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { username: string; password: string }) =>
    request<AuthResult & { ok: true }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  guest: (body: { nickname: string; avatar: string }) =>
    request<AuthResult & { ok: true }>('/api/auth/guest', { method: 'POST', body: JSON.stringify(body) }),
  me: () => request<{ user: UserProfile }>('/api/me'),
  rooms: () => request<{ rooms: RoomSummary[] }>('/api/rooms'),
  createRoom: (body: { players: number; baseScore: number; turnSeconds: number; botFill: boolean }) =>
    request<{ code: string }>('/api/rooms', { method: 'POST', body: JSON.stringify(body) }),
  room: (code: string) => request<{ room: RoomSummary }>(`/api/rooms/${code}`),
};

export function wsUrl(room: string, avatar: string): string {
  const t = token() ?? '';
  const explicit = import.meta.env.VITE_WS_BASE as string | undefined;
  if (explicit) {
    const u = new URL(explicit);
    u.searchParams.set('room', room);
    u.searchParams.set('token', t);
    u.searchParams.set('avatar', avatar);
    return u.toString();
  }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const u = new URL(`${proto}//${location.host}/ws`);
  u.searchParams.set('room', room);
  u.searchParams.set('token', t);
  u.searchParams.set('avatar', avatar);
  return u.toString();
}
