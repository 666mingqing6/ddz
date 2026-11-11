export interface Env {
  DB: D1Database;
  ROOMS: DurableObjectNamespace;
  ASSETS: Fetcher;
  JWT_SECRET: string;
  ENVIRONMENT?: string;
  ROOM_TTL_SECONDS?: string;
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
