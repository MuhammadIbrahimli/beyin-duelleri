CREATE TABLE users (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  city_code TEXT,
  device_class TEXT NOT NULL DEFAULT 'other',
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE experiments (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  experiment_id INTEGER NOT NULL REFERENCES experiments(id),
  seed INTEGER NOT NULL,
  duel_code TEXT,
  daily_date TEXT,
  status TEXT NOT NULL DEFAULT 'started',
  primary_score REAL,
  secondary_json TEXT,
  raw_json TEXT,
  level INTEGER,
  device_class TEXT NOT NULL DEFAULT 'other',
  client_version TEXT,
  valid INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX idx_runs_user ON runs(user_id, created_at);
CREATE INDEX idx_runs_exp ON runs(experiment_id, status, valid);

CREATE TABLE duels (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  experiment_id INTEGER NOT NULL REFERENCES experiments(id),
  seed INTEGER NOT NULL,
  creator_run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('1v1','group')),
  max_players INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE duel_entries (
  duel_id TEXT NOT NULL REFERENCES duels(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  rank INTEGER,
  PRIMARY KEY (duel_id, run_id)
);

CREATE TABLE daily (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE city_stats (
  date TEXT NOT NULL,
  experiment_id INTEGER NOT NULL,
  city_code TEXT NOT NULL,
  n INTEGER NOT NULL,
  median REAL NOT NULL,
  p25 REAL NOT NULL,
  p75 REAL NOT NULL,
  PRIMARY KEY (date, experiment_id, city_code)
);

CREATE TABLE percentiles (
  experiment_id INTEGER NOT NULL,
  device_class TEXT NOT NULL,
  n INTEGER NOT NULL,
  sorted_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (experiment_id, device_class)
);

CREATE TABLE anchor_assignments (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  anchor_value INTEGER NOT NULL,
  answer REAL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, question_id)
);

CREATE TABLE shares (
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE user_badges (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge TEXT NOT NULL,
  earned_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, badge)
);

INSERT INTO experiments (id, slug) VALUES
  (1,'refleks'),(2,'reng-ve-soz'),(3,'yaddas-zenciri'),
  (4,'yalanci-yaddas'),(5,'eyni-rengdir'),(6,'lovber');
