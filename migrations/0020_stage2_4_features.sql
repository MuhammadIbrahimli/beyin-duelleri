-- Quests, achievements, shop, Marafon, friends, teams, seasons, payment orders (architecture only).
-- New tables only: existing users, runs, groups, invite links and balances are not changed.

-- Counters per account, updated after every finished match and run: one read gives the numbers for achievements.
CREATE TABLE user_stats (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  matches INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  stage_wins INTEGER NOT NULL DEFAULT 0,
  training INTEGER NOT NULL DEFAULT 0,
  friendly INTEGER NOT NULL DEFAULT 0,
  rated_wins INTEGER NOT NULL DEFAULT 0,
  marafon_correct INTEGER NOT NULL DEFAULT 0,
  marafon_best INTEGER NOT NULL DEFAULT 0,
  daily_claims INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

-- Quest progress per period (a Baku day or a Baku week). A reward is claimed once.
CREATE TABLE quest_progress (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  quest_id TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  claimed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, period, quest_id)
);

-- Achievements unlocked by an account. The reward is given once, when the row is first written.
CREATE TABLE achievements (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ach_id TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, ach_id)
);

-- Marafon: one row per run. The expected answers are kept server-side only (in marafon_tasks).
CREATE TABLE marafon_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seed INTEGER NOT NULL,
  lives INTEGER NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  correct INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);
CREATE INDEX idx_marafon_user ON marafon_runs(user_id, started_at);
CREATE INDEX idx_marafon_score ON marafon_runs(status, score DESC);

CREATE TABLE marafon_tasks (
  run_id TEXT NOT NULL REFERENCES marafon_runs(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  kind TEXT NOT NULL,
  expected TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  limit_ms INTEGER NOT NULL,
  min_ms INTEGER NOT NULL DEFAULT 0,
  answered_at INTEGER,
  result TEXT,
  PRIMARY KEY (run_id, idx)
);

-- Shop: owned items and the item equipped in each slot.
CREATE TABLE inventory (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  acquired_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, item_id)
);
CREATE TABLE equipped (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot TEXT NOT NULL,
  item_id TEXT NOT NULL,
  PRIMARY KEY (user_id, slot)
);

-- Friends: a short personal code, and a two-way friendship (one row per direction).
CREATE TABLE friend_codes (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE TABLE friends (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);
-- Challenges: a friend invites to a room; the room code is sent back only to the two of them.
CREATE TABLE challenges (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','declined')),
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_challenges_to ON challenges(to_id, status);

-- Teams (groups of friends, classes, colleagues, faculties, universities). A university is `verified` only
-- when it is on the checked list (config/universities.ts) and an admin confirmed it.
CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('university','faculty','group','class','friends','colleagues')),
  code TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  verified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE team_members (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (team_id, user_id)
);

-- The season in which the rating was last corrected for this account (a soft correction happens once per season).
CREATE TABLE season_state (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  season_id TEXT NOT NULL
);

-- Payment orders. Written and confirmed on the server; no real provider is connected yet (see config/ads.ts).
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','paid','failed')),
  provider TEXT,
  created_at INTEGER NOT NULL
);
