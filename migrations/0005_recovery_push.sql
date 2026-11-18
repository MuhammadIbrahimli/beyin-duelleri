-- Account recovery code (only a keyed hash is stored) and web push subscriptions for streak reminders
ALTER TABLE users ADD COLUMN recovery_hash TEXT;
CREATE UNIQUE INDEX idx_users_recovery ON users(recovery_hash) WHERE recovery_hash IS NOT NULL;

CREATE TABLE push_subs (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lang TEXT NOT NULL DEFAULT 'az',
  created_at INTEGER NOT NULL,
  last_sent_day TEXT
);
CREATE INDEX idx_push_user ON push_subs(user_id);
