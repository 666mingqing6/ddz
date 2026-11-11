/**
 * Worker 入口：静态资源 + REST API + WebSocket 房间路由。
 * 前端与 API 同源部署，避免跨域与 Cookie 问题；D1 存账号与战绩，DO 管实时牌局。
 */
import type { Env } from './env';
import { createUser, getUserByName, getUserById, listRooms, recentMatches, removeRoom, roomExists, touchLogin } from './db';
import { hashPassword, signToken, uid, verifyPassword, verifyToken } from './auth';
import type { UserProfile } from '../shared/types';
import { DEFAULT_SETTINGS, VARIANTS } from '../shared/types';

export { GameRoom } from './room';

const TOKEN_TTL = 30 * 24 * 3600 * 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type,authorization',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS },
  });
}

function err(message: string, status = 400): Response {
  return json({ ok: false, error: message }, status);
}

function profile(row: {
  id: string;
  username: string;
  nickname: string;
  avatar: string;
  coins: number;
  wins: number;
  losses: number;
  draws: number;
  created_at: number;
}): UserProfile {
  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    avatar: row.avatar,
    coins: row.coins,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    createdAt: row.created_at,
  };
}

const AVATARS = ['🐯', '🐼', '🦊', '🐵', '🐶', '🐷', '🐸', '🐰', '🐨', '🐻', '🦁', '🐮'];

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function roomCode(): string {
  let s = '';
  const buf = crypto.getRandomValues(new Uint8Array(5));
  for (const b of buf) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return s;
}

async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

async function authUser(req: Request, env: Env) {
  const header = req.headers.get('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const payload = await verifyToken(token, env.JWT_SECRET);
  if (!payload) return null;
  const row = await getUserById(env, payload.uid);
  return row;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
      return new Response(null, { status: 204, headers: CORS });
    }

    // ---------------------------------------------------------- WebSocket
    if (url.pathname === '/ws') {
      const token = url.searchParams.get('token') ?? '';
      const payload = await verifyToken(token, env.JWT_SECRET);
      if (!payload) return new Response('unauthorized', { status: 401 });
      const code = (url.searchParams.get('room') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!code) return new Response('room required', { status: 400 });

      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      const headers = new Headers(request.headers);
      headers.set('x-user-id', payload.uid);
      headers.set('x-user-name', encodeURIComponent(payload.name));
      headers.set('x-user-avatar', encodeURIComponent(url.searchParams.get('avatar') ?? '🐯'));
      headers.set('x-room-code', code);
      return stub.fetch(new Request(`https://room/ws?${url.searchParams.toString()}`, { headers }));
    }

    // ---------------------------------------------------------- API
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url, ctx);
      } catch (e) {
        const message = e instanceof Error ? e.message : '服务器错误';
        return err(message, 500);
      }
    }

    // ---------------------------------------------------------- 静态资源
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

async function handleApi(req: Request, env: Env, url: URL, _ctx: ExecutionContext): Promise<Response> {
  const path = url.pathname;

  if (path === '/api/health') {
    return json({ ok: true, time: Date.now() });
  }

  // ---------------------------------------------------------- 注册
  if (path === '/api/auth/register' && req.method === 'POST') {
    const body = await readJson<{ username?: string; password?: string; nickname?: string; avatar?: string }>(req);
    const username = (body?.username ?? '').trim().toLowerCase();
    const password = body?.password ?? '';
    if (!/^[a-z0-9_]{3,16}$/.test(username)) return err('用户名需为 3-16 位字母、数字或下划线');
    if (password.length < 6) return err('密码至少 6 位');
    if (await getUserByName(env, username)) return err('该用户名已被注册', 409);

    const { hash, salt } = await hashPassword(password);
    const id = uid();
    const nickname = (body?.nickname ?? username).trim().slice(0, 12) || username;
    const avatar = AVATARS.includes(body?.avatar ?? '') ? body!.avatar! : AVATARS[Math.floor(Math.random() * AVATARS.length)];
    await createUser(env, { id, username, nickname, avatar, hash, salt });
    const row = await getUserById(env, id);
    const token = await signToken({ uid: id, name: nickname, exp: Date.now() + TOKEN_TTL }, env.JWT_SECRET);
    return json({ ok: true, token, user: profile(row!) });
  }

  // ---------------------------------------------------------- 登录
  if (path === '/api/auth/login' && req.method === 'POST') {
    const body = await readJson<{ username?: string; password?: string }>(req);
    const username = (body?.username ?? '').trim().toLowerCase();
    const password = body?.password ?? '';
    const row = await getUserByName(env, username);
    if (!row) return err('用户名或密码错误', 401);
    const ok = await verifyPassword(password, row.pass_hash, row.salt);
    if (!ok) return err('用户名或密码错误', 401);
    await touchLogin(env, row.id);
    const token = await signToken({ uid: row.id, name: row.nickname, exp: Date.now() + TOKEN_TTL }, env.JWT_SECRET);
    return json({ ok: true, token, user: profile(row) });
  }

  // ---------------------------------------------------------- 游客
  if (path === '/api/auth/guest' && req.method === 'POST') {
    const body = await readJson<{ nickname?: string; avatar?: string }>(req);
    const nickname = (body?.nickname ?? '').trim().slice(0, 12) || `游客${Math.floor(Math.random() * 9000 + 1000)}`;
    const id = `guest_${uid()}`;
    const avatar = AVATARS.includes(body?.avatar ?? '') ? body!.avatar! : AVATARS[Math.floor(Math.random() * AVATARS.length)];
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO users (id, username, nickname, avatar, pass_hash, salt, coins, wins, losses, draws, created_at, last_login_at)
       VALUES (?, ?, ?, ?, '', '', 5000, 0, 0, 0, ?, ?)`,
    )
      .bind(id, `guest_${id.slice(6, 16)}`, nickname, avatar, now, now)
      .run();
    const token = await signToken({ uid: id, name: nickname, exp: Date.now() + 7 * 24 * 3600 * 1000 }, env.JWT_SECRET);
    return json({
      ok: true,
      token,
      user: { id, username: '', nickname, avatar, coins: 5000, wins: 0, losses: 0, draws: 0, createdAt: now },
    });
  }

  // ---------------------------------------------------------- 当前用户
  if (path === '/api/me' && req.method === 'GET') {
    const row = await authUser(req, env);
    if (!row) return err('未登录', 401);
    return json({ ok: true, user: profile(row) });
  }

  if (path === '/api/history' && req.method === 'GET') {
    const row = await authUser(req, env);
    if (!row) return err('未登录', 401);
    return json({ ok: true, matches: await recentMatches(env, row.id) });
  }

  // ---------------------------------------------------------- 房间列表
  if (path === '/api/rooms' && req.method === 'GET') {
    return json({ ok: true, rooms: await listRooms(env) });
  }

  // ---------------------------------------------------------- 创建房间
  if (path === '/api/rooms' && req.method === 'POST') {
    const row = await authUser(req, env);
    if (!row) return err('未登录', 401);
    const body = await readJson<{ players?: number; baseScore?: number; turnSeconds?: number; botFill?: boolean; allowSpectator?: boolean }>(req);
    const players = VARIANTS[Number(body?.players ?? 3)] ? Number(body?.players ?? 3) : 3;
    const baseScore = [5, 10, 20, 50].includes(Number(body?.baseScore)) ? Number(body?.baseScore) : 10;
    const turnSeconds = [15, 25, 40].includes(Number(body?.turnSeconds)) ? Number(body?.turnSeconds) : 25;

    let code = roomCode();
    for (let i = 0; i < 6 && (await roomExists(env, code)); i++) code = roomCode();

    await env.DB.prepare(
      `INSERT INTO rooms (code, host_id, host_name, capacity, players, status, base_score, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, 'waiting', ?, ?, ?)`,
    )
      .bind(code, row.id, row.nickname, players, baseScore, Date.now(), Date.now())
      .run();

    // 初始化房间 DO，写入房主与设置
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    const settings = { ...DEFAULT_SETTINGS, players, baseScore, turnSeconds, botFill: body?.botFill !== false, allowSpectator: body?.allowSpectator !== false };
    await stub.fetch(
      new Request(`https://room/init?players=${players}&base=${baseScore}&turn=${turnSeconds}&bot=${settings.botFill ? 1 : 0}`, {
        headers: {
          'x-user-id': row.id,
          'x-user-name': encodeURIComponent(row.nickname),
          'x-user-avatar': encodeURIComponent(row.avatar),
          'x-room-code': code,
        },
      }),
    );

    return json({ ok: true, code, settings });
  }

  // ---------------------------------------------------------- 房间信息
  const roomMatch = path.match(/^\/api\/rooms\/([A-Z0-9]{4,8})$/);
  if (roomMatch && req.method === 'GET') {
    const code = roomMatch[1];
    const r = await env.DB.prepare('SELECT code, host_name, players, capacity, status, base_score FROM rooms WHERE code = ?')
      .bind(code)
      .first<{ code: string; host_name: string; players: number; capacity: number; status: string; base_score: number }>();
    if (!r) return err('房间不存在或已关闭', 404);
    return json({
      ok: true,
      room: { code: r.code, hostName: r.host_name, players: r.players, capacity: r.capacity, status: r.status, baseScore: r.base_score },
    });
  }

  if (roomMatch && req.method === 'DELETE') {
    const row = await authUser(req, env);
    if (!row) return err('未登录', 401);
    await removeRoom(env, roomMatch[1]);
    return json({ ok: true });
  }

  return err('接口不存在', 404);
}
