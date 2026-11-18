-- Optional profile (name, city, email), language, first-touch source
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN email_consent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN profile_done INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN src TEXT;
ALTER TABLE users ADD COLUMN lang TEXT NOT NULL DEFAULT 'az';

-- run/duel language: the word sets of "Yalançı yaddaş" depend on it, and a duel must stay in its creator's language
ALTER TABLE runs ADD COLUMN lang TEXT NOT NULL DEFAULT 'az';
ALTER TABLE duels ADD COLUMN lang TEXT NOT NULL DEFAULT 'az';

-- "Beyin balı": overall 0-100 score per user, updated on every finished valid run
CREATE TABLE user_scores (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  score REAL NOT NULL,
  played INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_scores_score ON user_scores(score DESC);

-- one row per user per active day: monthly/weekly/daily visitors, retention
CREATE TABLE activity (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  PRIMARY KEY (user_id, day)
);
CREATE INDEX idx_activity_day ON activity(day);
CREATE INDEX idx_users_created ON users(created_at);
