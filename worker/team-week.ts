// Weekly team competition: a team's score is the average win rate of its counted members in the Baku week.
// A member counts after 3 real matches in the week; a team needs 3 counted members. Shown for this week and the
// previous one, so there is a short history. Nothing is estimated: only stored matches count.
import { CITY_BATTLE } from "../config/city-battles";
import { weekStart } from "./calendar";

const WEEK = 7 * 24 * 60 * 60 * 1000;
export const TEAM_WEEK_MIN_MATCHES = CITY_BATTLE.minMatchesPerPlayer;
export const TEAM_WEEK_MIN_MEMBERS = 3;

export async function teamWeek(db: D1Database, start: number) {
  const end = start + WEEK;
  const rows = await db
    .prepare(
      "WITH m AS ( " +
        " SELECT user0 AS uid, CASE WHEN winner = 0 THEN 1 ELSE 0 END AS won FROM matches " +
        "  WHERE user0 IS NOT NULL AND mode != 'training' AND created_at >= ? AND created_at < ? " +
        " UNION ALL " +
        " SELECT user1, CASE WHEN winner = 1 THEN 1 ELSE 0 END FROM matches " +
        "  WHERE user1 IS NOT NULL AND mode != 'training' AND created_at >= ? AND created_at < ? " +
        "), per AS ( " +
        " SELECT uid, SUM(won) * 1.0 / COUNT(*) AS wr FROM m GROUP BY uid HAVING COUNT(*) >= ? " +
        ") " +
        "SELECT t.id, t.name, COUNT(per.uid) AS counted, AVG(per.wr) AS score FROM teams t " +
        " JOIN team_members tm ON tm.team_id = t.id JOIN per ON per.uid = tm.user_id " +
        " GROUP BY t.id HAVING COUNT(per.uid) >= ? ORDER BY score DESC, t.id LIMIT 20",
    )
    .bind(start, end, start, end, TEAM_WEEK_MIN_MATCHES, TEAM_WEEK_MIN_MEMBERS)
    .all<{ id: string; name: string; counted: number; score: number }>();
  return rows.results.map((r, i) => ({ rank: i + 1, id: r.id, name: r.name, counted: r.counted, score: Math.round(r.score * 1000) / 10 }));
}

export async function teamWeeks(db: D1Database, now: number) {
  const cur = weekStart(now);
  return {
    current: { start: cur, rows: await teamWeek(db, cur) },
    previous: { start: cur - WEEK, rows: await teamWeek(db, cur - WEEK) },
    minMatches: TEAM_WEEK_MIN_MATCHES,
    minMembers: TEAM_WEEK_MIN_MEMBERS,
  };
}
