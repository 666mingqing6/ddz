export interface Env {
  DB: D1Database;
  ROOMS: DurableObjectNamespace;
  ASSETS: Fetcher;
  JWT_SECRET: string;
  ENVIRONMENT?: string;
  ROOM_TTL_SECONDS?: string;
  /** 空房回收宽限（秒），默认 5 */
  EMPTY_GRACE_SECONDS?: string;
  /** 全离线回收等待（秒），默认 120 */
  EMPTY_TTL_SECONDS?: string;
}

export interface UserRow {
  id: string;
  username: string;
  nickname: string;
  avatar: string;
  pass_hash: string;
  salt: string;
  coins: number;
  wins: number;
  losses: number;
  draws: number;
  created_at: number;
  last_login_at: number | null;
}
