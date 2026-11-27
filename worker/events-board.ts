// Leaderboard of an event: wins in real matches played between the event's first and last Baku day.
import { EVENTS } from "../config/seasons";

export function eventWindow(id: string) {
  const e = EVENTS.find((x) => x.id === id && x.enabled);
  if (!e) return null;
  const start = Date.parse(e.from + "T00:00:00Z") - 4 * 3600e3; // Baku midnight
  const end = Date.parse(e.to + "T00:00:00Z") + 20 * 3600e3;     // the day after the last day, Baku midnight
  return { event: e, start, end };
}

export async function eventBoard(db: D1Database, id: string) {
  const w = eventWindow(id);
  if (!w) return null;
  const rows = await db
    .prepare(
      "WITH m AS ( SELECT user0 AS uid, CASE WHEN winner = 0 THEN 1 ELSE 0 END AS won FROM matches WHERE user0 IS NOT NULL AND mode != 'training' AND created_at >= ? AND created_at < ? " +
        "UNION ALL SELECT user1, CASE WHEN winner = 1 THEN 1 ELSE 0 END FROM matches WHERE user1 IS NOT NULL AND mode != 'training' AND created_at >= ? AND created_at < ?) " +
        "SELECT m.uid AS id, u.nickname AS nick, SUM(m.won) AS wins, COUNT(*) AS played FROM m JOIN users u ON u.id = m.uid GROUP BY m.uid ORDER BY wins DESC, played ASC, m.uid LIMIT 20",
    )
    .bind(w.start, w.end, w.start, w.end)
    .all<{ id: string; nick: string; wins: number; played: number }>();
  return {
    event: { id: w.event.id, title: w.event.title, description: w.event.description, from: w.event.from, to: w.event.to },
    rows: rows.results.map((r, i) => ({ rank: i + 1, nick: r.nick, wins: r.wins, played: r.played })),
  };
}
