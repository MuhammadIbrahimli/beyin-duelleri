-- Beyin duellisi (five-discipline match), competitive rating, account XP and the Qızıl ledger.
-- Only new tables: nothing existing is altered or dropped, so existing users, runs, groups and invite links are untouched.

-- Every finished match between two players or a player and a bot. The id is the room code (unique per room).
CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('rated','friendly','training')),
  rated INTEGER NOT NULL DEFAULT 0,
  winner INTEGER NOT NULL,
  reason TEXT NOT NULL,
  user0 TEXT REFERENCES users(id) ON DELETE SET NULL,
  user1 TEXT REFERENCES users(id) ON DELETE SET NULL,
  bot0 TEXT,
  bot1 TEXT,
  points0 INTEGER NOT NULL DEFAULT 0,
  points1 INTEGER NOT NULL DEFAULT 0,
  delta0 INTEGER NOT NULL DEFAULT 0,
  delta1 INTEGER NOT NULL DEFAULT 0,
  history_json TEXT NOT NULL DEFAULT '[]',
  flag TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_matches_user0 ON matches(user0, created_at);
CREATE INDEX idx_matches_user1 ON matches(user1, created_at);
CREATE INDEX idx_matches_pair ON matches(user0, user1, rated, created_at);

-- One row per account: the current competitive rating and its summary (best rank = peak).
CREATE TABLE ratings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL,
  peak INTEGER NOT NULL,
  played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_ratings_rating ON ratings(rating DESC);

-- Rating history: one row per account per rated match (the primary key makes a repeated write a no-op).
CREATE TABLE rating_history (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  rating_before INTEGER NOT NULL,
  rating_after INTEGER NOT NULL,
  delta INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, match_id)
);
CREATE INDEX idx_rating_history_user ON rating_history(user_id, created_at);

-- Balances: XP (account level) and Qızıl (the only in-game currency). A balance can never be negative.
CREATE TABLE wallets (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency TEXT NOT NULL CHECK (currency IN ('xp','qizil')),
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  PRIMARY KEY (user_id, currency)
);

-- The ledger: every change, with a unique ref so the same reward or purchase is applied once.
CREATE TABLE econ_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency TEXT NOT NULL CHECK (currency IN ('xp','qizil')),
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref TEXT NOT NULL UNIQUE,
  balance_after INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_ledger_user ON econ_ledger(user_id, created_at);
