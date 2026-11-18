import { Hono } from "hono";
import { EXPERIMENTS, todayBaku } from "../../shared/experiments";
import { overallScore, pointsFor } from "../../shared/points";
import { streakWithFreeze } from "../../shared/streak";
import type { AppEnv } from "../env";
import { auth } from "../middleware/auth";

export const recapRoutes = new Hono<AppEnv>();
recapRoutes.use("/me/recap", auth);

const DAYS = { week: 7, month: 30 } as const;
const BAKU = 4 * 3600000;

/**
 * Rolling recap ("last 7 / 30 days"): what you played, your Beyin balı now and how it moved, your strongest test.
 * Rolling windows are never empty on a Monday or on the 1st, unlike calendar weeks and months.
 */
recapRoutes.get("/me/recap", async (c) => {
  const period = c.req.query("period") === "month" ? "month" : "week";
  const db = c.env.DB;
  const me = c.get("userId");
  const now = Date.now();
  const startMs = now - DAYS[period] * 86400000;

  const { results } = await db.prepare(
    "SELECT experiment_id AS e, primary_score AS raw, finished_at AS at FROM runs WHERE user_id = ? AND status = 'finished' AND valid = 1 ORDER BY finished_at DESC LIMIT 1000",
  ).bind(me).all<{ e: number; raw: number; at: number }>();

  const bestAll = new Map<number, number>(), bestBefore = new Map<number, number>(), bestIn = new Map<number, { points: number; raw: number }>();
  const days = new Set<string>();
  let runs = 0;
  for (const r of results) {
    const x = EXPERIMENTS.find((q) => q.id === r.e);
    if (!x) continue;
    const pts = pointsFor(x.slug, r.raw);
    bestAll.set(r.e, Math.max(bestAll.get(r.e) ?? 0, pts));
    if (r.at < startMs) bestBefore.set(r.e, Math.max(bestBefore.get(r.e) ?? 0, pts));
    else {
      runs++;
      days.add(new Date(r.at + BAKU).toISOString().slice(0, 10));
      const cur = bestIn.get(r.e);
      if (!cur || pts > cur.points) bestIn.set(r.e, { points: pts, raw: r.raw });
    }
  }
  const total = EXPERIMENTS.length;
  const score = overallScore([...bestAll.values()], total);
  const before = overallScore([...bestBefore.values()], total);

  let best: { slug: string; points: number; raw: number } | null = null;
  for (const [e, v] of bestIn) {
    if (!best || v.points > best.points) best = { slug: EXPERIMENTS.find((q) => q.id === e)!.slug, ...v };
  }
  const { results: daily } = await db.prepare("SELECT date FROM daily WHERE user_id = ? ORDER BY date DESC LIMIT 400").bind(me).all<{ date: string }>();
  const players = await db.prepare("SELECT COUNT(*) AS n FROM user_scores").first<{ n: number }>();
  const above = await db.prepare("SELECT COUNT(*) AS n FROM user_scores WHERE score > ?").bind(score).first<{ n: number }>();

  return c.json({
    period, days: DAYS[period], runs, activeDays: days.size,
    streak: streakWithFreeze(daily.map((d) => d.date), todayBaku(now)).streak,
    overall: { score, delta: Math.round((score - before) * 10) / 10, played: bestAll.size, total },
    best,
    rank: bestAll.size ? { place: (above?.n ?? 0) + 1, of: players?.n ?? 1 } : null,
  });
});
