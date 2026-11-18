import { Hono } from "hono";
import { PERCENTILE_MIN_RUNS } from "../../config/cities";
import { bySlug, byId, dailySlug, todayBaku } from "../../shared/experiments";
import { levelFor } from "../../shared/levels";
import { pointsFor } from "../../shared/points";
import { hashString } from "../../shared/rng";
import { SCORERS } from "../../shared/scoring";
import { percentileBeaten } from "../../shared/stats";
import { finishedTooFast, tooManyRecentRuns } from "../../shared/validity";
import type { AppEnv } from "../env";
import { auth, deviceOf } from "../middleware/auth";
import { newSeed } from "../util";
import { awardBadges } from "../badges";
import { updateUserScore } from "../scores";
import { rankDuel } from "./duels";

export const runRoutes = new Hono<AppEnv>();
runRoutes.use("*", auth);

runRoutes.post("/runs/start", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  const b = await c.req.json<{ slug?: string; duelCode?: string; daily?: boolean }>().catch(() => ({}) as any);
  const meta = bySlug(String(b.slug ?? ""));
  const scorer = meta && SCORERS[meta.slug];
  if (!meta || !scorer) return c.json({ error: "unknown_experiment" }, 400);

  let seed = newSeed();
  let duelCode: string | null = null;
  let dailyDate: string | null = null;

  if (b.duelCode) {
    const d = await db.prepare("SELECT * FROM duels WHERE code = ?").bind(b.duelCode).first<any>();
    if (!d) return c.json({ error: "duel_not_found" }, 404);
    if (d.expires_at < Date.now()) return c.json({ error: "duel_expired" }, 410);
    if (d.experiment_id !== meta.id) return c.json({ error: "experiment_mismatch" }, 400);
    const entries = await db
      .prepare("SELECT r.user_id FROM duel_entries e JOIN runs r ON r.id = e.run_id WHERE e.duel_id = ?")
      .bind(d.id)
      .all<{ user_id: string }>();
    if (entries.results.some((e) => e.user_id === userId)) return c.json({ error: "already_joined" }, 409);
    if (entries.results.length >= d.max_players) return c.json({ error: "duel_closed" }, 409);
    seed = d.seed;
    duelCode = d.code;
  } else if (b.daily) {
    dailyDate = todayBaku();
    if (dailySlug(dailyDate) !== meta.slug) return c.json({ error: "not_todays_experiment" }, 400);
    seed = hashString(`${dailyDate}:${meta.slug}`);
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO runs (id, user_id, experiment_id, seed, duel_code, daily_date, device_class, client_version, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    )
    .bind(id, userId, meta.id, seed, duelCode, dailyDate, deviceOf(c), c.req.header("x-client-version") ?? null, Date.now())
    .run();
  const full = scorer.schedule(seed);
  return c.json({ runId: id, seed, schedule: scorer.publicView ? scorer.publicView(full) : full }, 201);
});

runRoutes.post("/runs/:id/finish", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  const run = await db
    .prepare("SELECT * FROM runs WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), userId)
    .first<any>();
  if (!run) return c.json({ error: "not_found" }, 404);
  if (run.status !== "started") return c.json({ error: "already_finished" }, 409);
  const meta = byId(run.experiment_id)!;
  const scorer = SCORERS[meta.slug];
  const body = await c.req.json<{ payload?: unknown }>().catch(() => ({}) as any);
  const schedule = scorer.schedule(run.seed);
  const res = scorer.score(schedule, body.payload);
  if (!res) return c.json({ error: "bad_payload" }, 400);

  const now = Date.now();
  let valid = res.valid;
  let invalidReason = res.invalidReason;
  if (valid && finishedTooFast(now - run.created_at, scorer.minDurationMs(schedule))) {
    valid = false;
    invalidReason = "too_quick";
  }
  if (valid) {
    const r = await db
      .prepare("SELECT COUNT(*) AS n FROM runs WHERE user_id = ? AND status = 'finished' AND finished_at > ?")
      .bind(userId, now - 60000)
      .first<{ n: number }>();
    if (tooManyRecentRuns(r?.n ?? 0)) {
      valid = false;
      invalidReason = "rapid_series";
    }
  }

  const level = levelFor(meta.slug, res.primary);
  await db
    .prepare(
      "UPDATE runs SET status='finished', primary_score=?, secondary_json=?, raw_json=?, level=?, valid=?, finished_at=? WHERE id=?",
    )
    .bind(res.primary, JSON.stringify(res.secondary), JSON.stringify(body.payload), level, valid ? 1 : 0, now, run.id)
    .run();

  if (meta.slug === "lovber" && valid) {
    // first answer per user and question feeds the collective result
    await db
      .prepare("INSERT OR IGNORE INTO anchor_assignments (user_id, question_id, anchor_value, answer, created_at) VALUES (?,?,?,?,?)")
      .bind(userId, schedule.questionId, schedule.anchor, res.secondary.answer, now)
      .run();
  }

  if (run.daily_date && valid) {
    await db
      .prepare("INSERT OR IGNORE INTO daily (user_id, date, run_id) VALUES (?,?,?)")
      .bind(userId, run.daily_date, run.id)
      .run();
  }

  let duel: { code: string } | null = null;
  const others: string[] = [];
  if (run.duel_code) {
    const d = await db
      .prepare("SELECT id, code FROM duels WHERE code = ?")
      .bind(run.duel_code)
      .first<{ id: string; code: string }>();
    if (d) {
      await db.prepare("INSERT OR IGNORE INTO duel_entries (duel_id, run_id) VALUES (?,?)").bind(d.id, run.id).run();
      await rankDuel(db, d.id);
      duel = { code: d.code };
      const { results: members } = await db
        .prepare("SELECT DISTINCT r.user_id AS id FROM duel_entries e JOIN runs r ON r.id = e.run_id WHERE e.duel_id = ?")
        .bind(d.id).all<{ id: string }>();
      others.push(...members.map((m) => m.id).filter((id) => id !== userId));
    }
  }

  // badges for the finisher; other duel members may earn one too (their duel just completed)
  const badges = valid ? await awardBadges(db, userId, todayBaku(now), now) : [];
  for (const id of others) await awardBadges(db, id, todayBaku(now), now);

  const points = pointsFor(meta.slug, res.primary);
  const overall = valid ? await updateUserScore(db, userId, now) : null;

  // Percentile: own device class if it has enough data, else all devices; null below PERCENTILE_MIN_RUNS.
  let percentile: number | null = null;
  if (valid) {
    for (const dc of [run.device_class, "all"]) {
      const p = await db
        .prepare("SELECT n, sorted_json FROM percentiles WHERE experiment_id = ? AND device_class = ?")
        .bind(meta.id, dc)
        .first<{ n: number; sorted_json: string }>();
      if (p && p.n >= PERCENTILE_MIN_RUNS) {
        percentile = percentileBeaten(JSON.parse(p.sorted_json), p.n, res.primary, meta.direction);
        break;
      }
    }
  }
  return c.json({
    runId: run.id,
    slug: meta.slug,
    primary: res.primary,
    secondary: res.secondary,
    valid,
    invalidReason: invalidReason ?? null,
    level,
    percentile,
    duel,
    badges,
    points,
    overall,
  });
});
