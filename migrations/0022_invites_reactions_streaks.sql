-- Team invitations, safe friend reactions and claimed streak rewards. Only new tables; nothing existing is changed.

-- A friend invited into a team. Accepting joins the team; declining closes the invitation.
CREATE TABLE team_invites (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  from_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','declined')),
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_team_invites_to ON team_invites(to_id, status);

-- Reactions from a fixed list only (no free text, no chat).
CREATE TABLE friend_reactions (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_friend_reactions_to ON friend_reactions(to_id, created_at);

-- A streak milestone is claimed once. Breaking the streak later does not take a claimed reward back.
CREATE TABLE streak_claims (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  days INTEGER NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, days)
);
