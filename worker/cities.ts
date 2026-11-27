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

// ---- the discipline of the week: one stage of the match, rotated week by week -------------------------------------

export const DISCIPLINES = ["reaction", "memory", "math", "attention", "logic"] as const;
export type Discipline = (typeof DISCIPLINES)[number];
export const DISCIPLINE_MIN_STAGES = 2;

export function disciplineFor(now: number): Discipline {
  const index = Math.floor(weekStart(now) / (7 * 24 * 60 * 60 * 1000));
  return DISCIPLINES[((index % DISCIPLINES.length) + DISCIPLINES.length) % DISCIPLINES.length];
}

/** Each city's average stage win rate in this week's discipline. A player counts after DISCIPLINE_MIN_STAGES plays. */
export async function disciplineBattle(db: D1Database, now: number) {
  const b = battleFor(now);
  const discipline = disciplineFor(now);
  const rows = await db
    .prepare(
      "SELECT user0, user1, winner, history_json FROM matches WHERE mode != 'training' AND created_at >= ? AND created_at < ? LIMIT 5000",
    )
    .bind(b.start, b.end)
    .all<{ user0: string | null; user1: string | null; winner: number; history_json: string }>();
  const stats = new Map<string, { won: number; played: number }>();
  const bump = (uid: string | null, won: boolean, played: number) => {
    if (!uid) return;
    const s = stats.get(uid) ?? { won: 0, played: 0 };
    s.won += won ? 1 : 0;
    s.played += played;
    stats.set(uid, s);
  };
  for (const m of rows.results) {
    let history: { id: string; winner: number }[] = [];
    try {
      history = JSON.parse(m.history_json ?? "[]");
    } catch {
      history = [];
    }
    for (const h of history) {
      if (h.id !== discipline) continue;
      bump(m.user0, h.winner === 0, 1);
      bump(m.user1, h.winner === 1, 1);
    }
  }
  const users = await db
    .prepare(
      "SELECT id, city_code, city_changed_at FROM users WHERE city_code IN (?, ?)",
    )
    .bind(b.pair[0], b.pair[1])
    .all<{ id: string; city_code: string; city_changed_at: number | null }>();
  const byCity = new Map<string, number[]>();
  for (const u of users.results) {
    if (u.city_changed_at && u.city_changed_at >= b.start) continue; // changed the city this week
    const s = stats.get(u.id);
    if (!s || s.played < DISCIPLINE_MIN_STAGES) continue;
    const list = byCity.get(u.city_code) ?? [];
    list.push(s.won / s.played);
    byCity.set(u.city_code, list);
  }
  const cities = b.pair.map((code) => {
    const list = byCity.get(code) ?? [];
    const enough = list.length >= CITY_BATTLE.minPlayersPerCity;
    const avg = list.length ? list.reduce((a, c) => a + c, 0) / list.length : 0;
    return { city: code, name: CITY_BATTLE.names[code] ?? code, players: list.length, score: enough ? Math.round(avg * 1000) / 10 : null, enough };
  });
  let leader: string | null = null;
  if (cities.every((c) => c.enough && c.score !== null)) {
    const [x, y] = cities;
    leader = x.score! === y.score! ? "draw" : x.score! > y.score! ? x.city : y.city;
  }
  return { discipline, week: b.week, cities, leader, minStages: DISCIPLINE_MIN_STAGES };
}
