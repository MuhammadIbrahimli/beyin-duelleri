import { Hono } from "hono";
import { CITY_MIN_PARTICIPANTS } from "../../config/cities";
import { SOURCES } from "../../config/sources";
import { EXPERIMENTS, bySlug, dailySlug, todayUTC } from "../../shared/experiments";
import type { AppEnv } from "../env";
import { auth } from "../middleware/auth";

export const miscRoutes = new Hono<AppEnv>();
miscRoutes.use("*", auth);

miscRoutes.get("/experiments", async (c) => {
  const date = todayUTC();
  const done = await c.env.DB.prepare("SELECT 1 FROM daily WHERE user_id = ? AND date = ?")
    .bind(c.get("userId"), date)
    .first();
  return c.json({
    experiments: EXPERIMENTS.map((e) => ({ slug: e.slug, direction: e.direction, sourceUrl: SOURCES[e.slug]?.url })),
    daily: { date, slug: dailySlug(date), done: !!done },
  });
});

miscRoutes.get("/rankings/cities", async (c) => {
  const meta = bySlug(c.req.query("experiment") ?? "");
  if (!meta) return c.json({ error: "unknown_experiment" }, 400);
  const { results } = await c.env.DB.prepare(
    `SELECT city_code AS city, n, median, p25, p75 FROM city_stats
     WHERE experiment_id = ? AND date = (SELECT MAX(date) FROM city_stats WHERE experiment_id = ?)
     ORDER BY median ${meta.direction === "lower" ? "ASC" : "DESC"}`,
  )
    .bind(meta.id, meta.id)
    .all();
  c.header("Cache-Control", "private, max-age=300");
  return c.json({ minParticipants: CITY_MIN_PARTICIPANTS, cities: results });
});

/** Consecutive days ending today (or yesterday). Stage 6 adds the weekly free freeze. */
export function streakOf(dates: string[], today: string): number {
  const set = new Set(dates);
  const day = (back: number) => new Date(Date.parse(today + "T00:00:00Z") - back * 86400000).toISOString().slice(0, 10);
  const start = set.has(today) ? 0 : 1;
  let n = 0;
  while (set.has(day(start + n))) n++;
  return n;
}

miscRoutes.get("/me/passport", async (c) => {
  const db = c.env.DB;
  const userId = c.get("userId");
  const { results: runs } = await db
    .prepare(
      `SELECT experiment_id AS e, primary_score AS score, level, finished_at AS at FROM runs
       WHERE user_id = ? AND status = 'finished' AND valid = 1 ORDER BY finished_at DESC LIMIT 200`,
    )
    .bind(userId)
    .all<{ e: number; score: number; level: number | null; at: number }>();
  const experiments = EXPERIMENTS.map((x) => {
    const mine = runs.filter((r) => r.e === x.id);
    let best: (typeof mine)[number] | null = null;
    for (const r of mine) {
      if (!best || (x.direction === "lower" ? r.score < best.score : r.score > best.score)) best = r;
    }
    return {
      slug: x.slug,
      runs: mine.length,
      best: best && { score: best.score, level: best.level },
      history: mine.slice(0, 14).map((r) => ({ score: r.score, at: r.at })),
    };
  });
  const { results: days } = await db
    .prepare("SELECT date FROM daily WHERE user_id = ? ORDER BY date DESC LIMIT 400")
    .bind(userId)
    .all<{ date: string }>();
  const { results: badges } = await db
    .prepare("SELECT badge FROM user_badges WHERE user_id = ?")
    .bind(userId)
    .all<{ badge: string }>();
  return c.json({
    experiments,
    streak: streakOf(days.map((d) => d.date), todayUTC()),
    badges: badges.map((b) => b.badge),
  });
});

miscRoutes.post("/shares", async (c) => {
  const b = await c.req.json<{ runId?: string; channel?: string }>().catch(() => ({}) as any);
  const ch = ["whatsapp", "telegram", "instagram", "copy", "card"].includes(b.channel) ? b.channel : null;
  if (!ch) return c.json({ error: "bad_channel" }, 400);
  const run = await c.env.DB.prepare("SELECT id FROM runs WHERE id = ? AND user_id = ?")
    .bind(String(b.runId), c.get("userId"))
    .first<{ id: string }>();
  if (!run) return c.json({ error: "not_found" }, 404);
  await c.env.DB.prepare("INSERT INTO shares (run_id, channel, created_at) VALUES (?,?,?)")
    .bind(run.id, ch, Date.now())
    .run();
  return c.json({ ok: true });
});
