// Ranking of today's daily test: every player plays the same experiment, so the scores are comparable.
// Scope: everyone, friends, or the player's city. Ties are shared by place and ordered by account id.
import { bySlug, dailySlug, todayBaku } from "../shared/experiments";

export async function dailyBoard(db: D1Database, uid: string, scope: string, now: number) {
  const day = todayBaku(now);
  const meta = bySlug(dailySlug(day));
  if (!meta) return null;
  const me = await db.prepare("SELECT city_code FROM users WHERE id = ?").bind(uid).first<{ city_code: string | null }>();
  const filter =
    scope === "friends"
      ? " AND (d.user_id IN (SELECT friend_id FROM friends WHERE user_id = ?) OR d.user_id = ?)"
      : scope === "city" && me?.city_code
        ? " AND d.user_id IN (SELECT id FROM users WHERE city_code = ?)"
        : "";
  const binds: unknown[] = [day, meta.id];
  if (scope === "friends") binds.push(uid, uid);
  if (scope === "city" && me?.city_code) binds.push(me.city_code);
  const rows = await db
    .prepare(
      "SELECT d.user_id AS id, u.nickname AS nick, MAX(r.primary_score) AS value FROM daily d " +
        "JOIN runs r ON r.id = d.run_id JOIN users u ON u.id = d.user_id " +
        "WHERE d.date = ? AND r.experiment_id = ? AND r.valid = 1 AND r.primary_score IS NOT NULL" + filter +
        " GROUP BY d.user_id",
    )
    .bind(...binds)
    .all<{ id: string; nick: string; value: number }>();
  const higher = meta.direction === "higher";
  const sorted = [...rows.results].sort((a, b) => (higher ? b.value - a.value : a.value - b.value) || (a.id < b.id ? -1 : 1));
  // equal values share a place (1, 2, 2, 4 …)
  const places: number[] = sorted.map((x, i) => (i > 0 && x.value === sorted[i - 1].value ? 0 : i + 1));
  for (let i = 1; i < places.length; i++) if (places[i] === 0) places[i] = places[i - 1];
  const rank = (i: number) => places[i];
  const mineIdx = sorted.findIndex((x) => x.id === uid);
  return {
    date: day,
    slug: meta.slug,
    direction: meta.direction,
    scope,
    rows: sorted.map((x, i) => ({ rank: rank(i), id: x.id === uid ? "me" : null, nick: x.nick, value: x.value })),
    me: mineIdx >= 0 ? { rank: rank(mineIdx), value: sorted[mineIdx].value } : null,
    players: sorted.length,
  };
}
