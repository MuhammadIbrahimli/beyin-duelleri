-- Presence privacy switch and team challenges. Non-destructive: one new column with a default, one new table.

-- Whether friends may see that this player is online. On by default; the player can switch it off in settings.
ALTER TABLE users ADD COLUMN show_presence INTEGER NOT NULL DEFAULT 1;

-- A team challenge: one team invites another for a week. It is accepted by the other team's owner.
-- Its result is counted from real matches between members of the two teams during that Baku week.
CREATE TABLE team_challenges (
  id TEXT PRIMARY KEY,
  from_team TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  to_team TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  week_start INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','declined')),
  created_at INTEGER NOT NULL,
  CHECK (from_team <> to_team)
);
CREATE INDEX idx_team_challenges_from ON team_challenges(from_team, created_at);
CREATE INDEX idx_team_challenges_to ON team_challenges(to_team, created_at);
