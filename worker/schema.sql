-- 斗地主在线 · D1 结构
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  nickname      TEXT NOT NULL,
  avatar        TEXT NOT NULL DEFAULT '🐯',
  pass_hash     TEXT NOT NULL,
  salt          TEXT NOT NULL,
  coins         INTEGER NOT NULL DEFAULT 10000,
  wins          INTEGER NOT NULL DEFAULT 0,
  losses        INTEGER NOT NULL DEFAULT 0,
  draws         INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_users_name ON users(username);

CREATE TABLE IF NOT EXISTS rooms (
  code       TEXT PRIMARY KEY,
  host_id    TEXT,
  host_name  TEXT NOT NULL DEFAULT '',
  capacity   INTEGER NOT NULL DEFAULT 3,
  players    INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'waiting',
  base_score INTEGER NOT NULL DEFAULT 10,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rooms_updated ON rooms(updated_at);

CREATE TABLE IF NOT EXISTS matches (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  room_code    TEXT NOT NULL,
  round        INTEGER NOT NULL DEFAULT 1,
  landlord_id  TEXT,
  winner_role  TEXT NOT NULL,
  base_score   INTEGER NOT NULL,
  multiplier   INTEGER NOT NULL,
  spring       INTEGER NOT NULL DEFAULT 0,
  payload      TEXT NOT NULL DEFAULT '{}',
  created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_matches_created ON matches(created_at);
