import type { Env, UserRow } from './env';
import type { RoomSettings, RoomSummary } from '../shared/types';

export async function getUserByName(env: Env, username: string): Promise<UserRow | null> {
  return env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username.toLowerCase()).first<UserRow>();
}

export async function getUserById(env: Env, id: string): Promise<UserRow | null> {
  return env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
}

export async function createUser(
  env: Env,
  u: { id: string; username: string; nickname: string; avatar: string; hash: string; salt: string },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (id, username, nickname, avatar, pass_hash, salt, coins, wins, losses, draws, created_at, last_login_at)
     VALUES (?, ?, ?, ?, ?, ?, 10000, 0, 0, 0, ?, ?)`,
  )
    .bind(u.id, u.username.toLowerCase(), u.nickname, u.avatar, u.hash, u.salt, Date.now(), Date.now())
    .run();
}

export async function touchLogin(env: Env, id: string): Promise<void> {
  await env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(Date.now(), id).run();
}

export async function applyMatchResult(
  env: Env,
  rows: { userId: string; delta: number; win: boolean; draw: boolean }[],
): Promise<void> {
  const stmts = rows.map((r) =>
    env.DB.prepare(
      `UPDATE users SET coins = MAX(0, coins + ?), wins = wins + ?, losses = losses + ?, draws = draws + ? WHERE id = ?`,
    ).bind(r.delta, r.win ? 1 : 0, !r.win && !r.draw ? 1 : 0, r.draw ? 1 : 0, r.userId),
  );
  if (stmts.length) await env.DB.batch(stmts);
}

export async function upsertRoom(
  env: Env,
  room: { code: string; hostId: string | null; hostName: string; capacity: number; players: number; status: string; baseScore: number },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO rooms (code, host_id, host_name, capacity, players, status, base_score, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET players=excluded.players, status=excluded.status,
       capacity=excluded.capacity, base_score=excluded.base_score, host_name=excluded.host_name, updated_at=excluded.updated_at`,
  )
    .bind(room.code, room.hostId, room.hostName, room.capacity, room.players, room.status, room.baseScore, Date.now(), Date.now())
    .run();
}

export async function removeRoom(env: Env, code: string): Promise<void> {
  await env.DB.prepare('DELETE FROM rooms WHERE code = ?').bind(code).run();
}

export async function listRooms(env: Env): Promise<RoomSummary[]> {
  const now = Date.now();
  const cutoff = now - 6 * 60 * 60 * 1000;
  // 兜底清理：过期房间，以及创建后一直没人进入的空房
  try {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM rooms WHERE updated_at < ?').bind(cutoff),
      env.DB.prepare('DELETE FROM rooms WHERE players = 0 AND updated_at < ?').bind(now - 5 * 60 * 1000),
    ]);
  } catch {
    // 清理失败不影响列表读取
  }
  const { results } = await env.DB.prepare(
    'SELECT code, host_name, players, capacity, status, base_score, updated_at FROM rooms WHERE updated_at > ? ORDER BY updated_at DESC LIMIT 40',
  )
    .bind(cutoff)
    .all<{ code: string; host_name: string; players: number; capacity: number; status: string; base_score: number; updated_at: number }>();
  return (results ?? []).map((r) => ({
    code: r.code,
    hostName: r.host_name,
    players: r.players,
    capacity: r.capacity,
    status: r.status === 'playing' ? 'playing' : 'waiting',
    baseScore: r.base_score,
    updatedAt: r.updated_at,
  }));
}

export async function roomExists(env: Env, code: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT code FROM rooms WHERE code = ?').bind(code).first();
  return !!row;
}

export async function recordMatch(
  env: Env,
  m: {
    roomCode: string;
    round: number;
    landlordId: string | null;
    winnerRole: string;
    baseScore: number;
    multiplier: number;
    spring: boolean;
    payload: string;
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO matches (room_code, round, landlord_id, winner_role, base_score, multiplier, spring, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(m.roomCode, m.round, m.landlordId, m.winnerRole, m.baseScore, m.multiplier, m.spring ? 1 : 0, m.payload, Date.now())
    .run();
}

export async function recentMatches(env: Env, userId: string): Promise<unknown[]> {
  const { results } = await env.DB.prepare(
    `SELECT m.round, m.winner_role, m.base_score, m.multiplier, m.created_at, m.payload
     FROM matches m WHERE m.payload LIKE ? ORDER BY m.created_at DESC LIMIT 20`,
  )
    .bind(`%"${userId}"%`)
    .all();
  return results ?? [];
}

export function settingsToRoom(settings: RoomSettings, code: string, hostId: string | null, hostName: string) {
  return {
    code,
    hostId,
    hostName,
    capacity: settings.players,
    players: 1,
    status: 'waiting',
    baseScore: settings.baseScore,
  };
}
