import { Hono } from "hono";
import { CITY_CODES } from "../../config/cities";
import { LOVBER_MIN_GROUP, LOVBER_QUESTIONS } from "../../config/lovber";
import { SOURCES } from "../../config/sources";
import { EXPERIMENTS, byId, dailySlug, todayBaku } from "../../shared/experiments";
import { pointsFor } from "../../shared/points";
import { streakWithFreeze, weekDays } from "../../shared/streak";
import type { AppEnv } from "../env";
import { auth } from "../middleware/auth";

export const miscRoutes = new Hono<AppEnv>();
miscRoutes.use("*", auth);

miscRoutes.get("/experiments", async (c) => {
  const date = todayBaku();
  const me = c.get("userId");
  const done = await c.env.DB.prepare("SELECT 1 FROM daily WHERE user_id = ? AND date = ?").bind(me, date).first();
  // per-test progress for the home screen: how many valid runs, and the best Beyin balı points so far
  const { results: runs } = await c.env.DB.prepare(
    "SELECT experiment_id AS e, primary_score AS raw FROM runs WHERE user_id = ? AND status = 'finished' AND valid = 1 ORDER BY finished_at DESC LIMIT 1000",
  ).bind(me).all<{ e: number; raw: number }>();
  const progress: Record<string, { runs: number; points: number | null }> = {};
  for (const x of EXPERIMENTS) progress[x.slug] = { runs: 0, points: null };
  for (const r of runs) {
    const x = EXPERIMENTS.find((q) => q.id === r.e);
    if (!x) continue;
    const p = progress[x.slug];
    p.runs++;
    const pts = pointsFor(x.slug, r.raw);
    p.points = p.points === null ? pts : Math.max(p.points, pts);
  }
  return c.json({
    experiments: EXPERIMENTS.map((e) => ({ slug: e.slug, direction: e.direction, sourceUrl: SOURCES[e.slug]?.url })),
    daily: { date, slug: dailySlug(date), done: !!done },
    progress,
  });
});

/** Cities ranked by the average Beyin balı of their players. A city appears as soon as it has one player. */
miscRoutes.get("/rankings/cities", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT u.city_code AS city, ROUND(AVG(s.score), 1) AS score, COUNT(*) AS players
     FROM user_scores s JOIN users u ON u.id = s.user_id
     WHERE u.city_code IS NOT NULL GROUP BY u.city_code ORDER BY score DESC, players DESC LIMIT 20`,
  ).all();
  c.header("Cache-Control", "private, max-age=30");
  return c.json({ cities: results });
});

/** Top players by Beyin balı (optionally inside one city) plus the caller's own place. */
miscRoutes.get("/rankings/players", async (c) => {
  const q = c.req.query("city");
  const city = q && (CITY_CODES as readonly string[]).includes(q) ? q : null;
  const where = city ? "WHERE u.city_code = ?" : "";
  const args = city ? [city] : [];
  const me = c.get("userId");
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.nickname, u.city_code AS city, s.score, s.played FROM user_scores s JOIN users u ON u.id = s.user_id
     ${where} ORDER BY s.score DESC, s.played DESC, s.updated_at ASC LIMIT 20`,
  ).bind(...args).all<any>();
  const mine = await c.env.DB.prepare("SELECT score, played FROM user_scores WHERE user_id = ?").bind(me).first<{ score: number; played: number }>();
  let rank: number | null = null;
  if (mine) {
    const r = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM user_scores s JOIN users u ON u.id = s.user_id ${city ? "WHERE u.city_code = ? AND" : "WHERE"} s.score > ?`,
    ).bind(...args, mine.score).first<{ n: number }>();
    rank = (r?.n ?? 0) + 1;
  }
  return c.json({
    city,
    total: EXPERIMENTS.length,
    players: results.map((p) => ({ nickname: p.nickname, city: p.city, score: p.score, played: p.played, isMe: p.id === me })),
    me: mine ? { rank, score: mine.score, played: mine.played } : null,
  });
});

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
      best: best && { score: best.score, level: best.level, points: pointsFor(x.slug, best.score) },
      history: mine.slice(0, 30).map((r) => ({ score: r.score, at: r.at })),
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
  const sc = await db.prepare("SELECT score, played FROM user_scores WHERE user_id = ?").bind(userId).first<{ score: number; played: number }>();
  const above = sc ? await db.prepare("SELECT COUNT(*) AS n FROM user_scores WHERE score > ?").bind(sc.score).first<{ n: number }>() : null;
  return c.json({
    overall: { score: sc?.score ?? 0, played: sc?.played ?? 0, total: EXPERIMENTS.length, rank: sc ? (above?.n ?? 0) + 1 : null },
    experiments,
    streak: streakWithFreeze(days.map((d) => d.date), todayBaku()).streak,
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

/** Collective Lövbər result: mean answer per anchor group, shown once every group has enough answers. */
miscRoutes.get("/lovber/stats", async (c) => {
  const q = LOVBER_QUESTIONS.find((x) => x.id === c.req.query("question"));
  if (!q) return c.json({ error: "unknown_question" }, 400);
  const { results } = await c.env.DB.prepare(
    "SELECT anchor_value AS anchor, COUNT(*) AS n, AVG(answer) AS mean FROM anchor_assignments WHERE question_id = ? AND answer IS NOT NULL GROUP BY anchor_value",
  ).bind(q.id).all<{ anchor: number; n: number; mean: number }>();
  const byAnchor = (a: number) => results.find((r) => r.anchor === a);
  const lo = byAnchor(q.low), hi = byAnchor(q.high);
  const ready = !!lo && !!hi && lo.n >= LOVBER_MIN_GROUP && hi.n >= LOVBER_MIN_GROUP;
  c.header("Cache-Control", "private, max-age=300");
  return c.json({ ready, minGroup: LOVBER_MIN_GROUP, low: ready ? Math.round(lo!.mean) : null, high: ready ? Math.round(hi!.mean) : null });
});

/** Daily test card for the home screen: today's experiment, streak, and the dots of the current week. */
miscRoutes.get("/daily", async (c) => {
  const today = todayBaku();
  const { results } = await c.env.DB.prepare("SELECT date FROM daily WHERE user_id = ? ORDER BY date DESC LIMIT 60")
    .bind(c.get("userId")).all<{ date: string }>();
  const dates = results.map((r) => r.date);
  const info = streakWithFreeze(dates, today);
  return c.json({
    date: today,
    slug: dailySlug(today),
    weekly: new Date(today + "T00:00:00Z").getUTCDay() === 0, // Sunday = "Həftənin duelu"
    done: dates.includes(today),
    streak: info.streak,
    week: weekDays(today).map((d) => ({ date: d, done: dates.includes(d), frozen: info.frozen.includes(d), today: d === today })),
  });
});

/** Duels the user created or joined, newest first. */
miscRoutes.get("/me/duels", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT d.code, d.experiment_id AS exp, d.type, d.max_players AS maxPlayers, d.expires_at AS expiresAt, d.created_at AS createdAt,
            (SELECT COUNT(*) FROM duel_entries x JOIN runs rx ON rx.id = x.run_id WHERE x.duel_id = d.id AND rx.status = 'finished') AS finished,
            e.rank AS myRank
     FROM duel_entries e JOIN runs r ON r.id = e.run_id JOIN duels d ON d.id = e.duel_id
     WHERE r.user_id = ? ORDER BY d.created_at DESC LIMIT 30`,
  ).bind(c.get("userId")).all<any>();
  const now = Date.now();
  return c.json({
    duels: results.map((d) => ({
      code: d.code, slug: byId(d.exp)!.slug, type: d.type, finished: d.finished, maxPlayers: d.maxPlayers,
      status: d.expiresAt < now ? "expired" : d.finished >= d.maxPlayers ? "closed" : "open",
      myRank: d.finished >= 2 ? d.myRank : null,
    })),
  });
});
