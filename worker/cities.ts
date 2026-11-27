// Weekly city battles. A player's score in the week is their win rate in real matches; a city's score is the average
// of its counted players (a mean, so a bigger city gains nothing from its size). Only players who played enough
// matches and did not change the city this week are counted. Shown with the reminder that the result is about the
// players of the game only, not about the people of the city.
import { CITY_BATTLE } from "../config/city-battles";
import { weekKey, weekStart } from "./calendar";

export function battleFor(now: number): { week: string; pair: [string, string]; start: number; end: number } {
  const week = weekKey(now);
  const index = Math.floor(weekStart(now) / (7 * 24 * 60 * 60 * 1000));
  const pair = CITY_BATTLE.pairs[((index % CITY_BATTLE.pairs.length) + CITY_BATTLE.pairs.length) % CITY_BATTLE.pairs.length];
  const start = weekStart(now);
  return { week, pair, start, end: start + 7 * 24 * 60 * 60 * 1000 };
}

export interface CityScore {
  city: string;
  name: string;
  players: number;
  score: number | null;   // average win rate in percent; null when there are not enough players
  enough: boolean;
}

export async function cityBattle(db: D1Database, now: number) {
  const b = battleFor(now);
  const rows = await db
    .prepare(
      "WITH m AS ( " +
        " SELECT user0 AS uid, CASE WHEN winner = 0 THEN 1 ELSE 0 END AS won FROM matches " +
        "  WHERE user0 IS NOT NULL AND mode != 'training' AND created_at >= ? AND created_at < ? " +
        " UNION ALL " +
        " SELECT user1 AS uid, CASE WHEN winner = 1 THEN 1 ELSE 0 END AS won FROM matches " +
        "  WHERE user1 IS NOT NULL AND mode != 'training' AND created_at >= ? AND created_at < ? " +
        "), per AS ( " +
        " SELECT uid, SUM(won) * 1.0 / COUNT(*) AS wr, COUNT(*) AS n FROM m GROUP BY uid HAVING COUNT(*) >= ? " +
        ") " +
        "SELECT u.city_code AS city, COUNT(*) AS players, AVG(per.wr) AS score FROM per " +
        " JOIN users u ON u.id = per.uid " +
        " WHERE u.city_code IN (?, ?) " +
        "   AND (u.city_changed_at IS NULL OR u.city_changed_at < ?) " +
        " GROUP BY u.city_code",
    )
    .bind(b.start, b.end, b.start, b.end, CITY_BATTLE.minMatchesPerPlayer, b.pair[0], b.pair[1], b.start)
    .all<{ city: string; players: number; score: number }>();
  const byCity = new Map(rows.results.map((r) => [r.city, r]));
  const cities: CityScore[] = b.pair.map((code) => {
    const r = byCity.get(code);
    const players = r?.players ?? 0;
    const enough = players >= CITY_BATTLE.minPlayersPerCity;
    return {
      city: code,
      name: CITY_BATTLE.names[code] ?? code,
      players,
      score: enough && r ? Math.round(r.score * 1000) / 10 : null,
      enough,
    };
  });
  let leader: string | null = null;
  if (cities.every((c) => c.enough && c.score !== null)) {
    const [a, c] = cities;
    leader = a.score! === c.score! ? "draw" : a.score! > c.score! ? a.city : c.city;
  }
  return { week: b.week, cities, leader, endsAt: b.end, minPlayers: CITY_BATTLE.minPlayersPerCity, minMatches: CITY_BATTLE.minMatchesPerPlayer };
}
