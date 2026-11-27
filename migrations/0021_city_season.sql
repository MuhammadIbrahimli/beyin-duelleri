-- City change protection and season results. Non-destructive: one new nullable column and one new table.

-- When the player last changed the city. A change is allowed once per cooldown, and a city battle only counts a
-- player whose city was not changed inside the battle week.
ALTER TABLE users ADD COLUMN city_changed_at INTEGER;

-- A short summary of each finished season for the player: best rating, final rating, matches and wins.
-- The history of the season stays forever; a season end never deletes rating history.
CREATE TABLE season_results (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_id TEXT NOT NULL,
  peak INTEGER NOT NULL,
  rating_end INTEGER NOT NULL,
  played INTEGER NOT NULL,
  wins INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, season_id)
);
