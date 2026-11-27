// Daily and weekly quests. The quests of a day are the same for every player (one seed per Baku day).
// Progress is added by the server after a finished match. A reward is claimed once: the claim flips `claimed`
// with a condition, and the balance change carries a unique reference, so a repeated claim changes nothing.
import { DAILY_COUNT, DAILY_POOL, WEEKLY, type QuestDef, type QuestMetric } from "../config/quests";
import { hashString, rng, shuffle } from "../shared/rng";
import { credit } from "./economy-core";
import { checkAchievements } from "./achievements";
import { dayKey, weekKey } from "./calendar";

export const dailyFor = (day: string): QuestDef[] => shuffle(rng(hashString("daily:" + day)), DAILY_POOL).slice(0, DAILY_COUNT);

export type Delta = Partial<Record<QuestMetric, number>>;

async function ensureStats(db: D1Database, uid: string, now: number) {
  await db.prepare("INSERT OR IGNORE INTO user_stats (user_id, updated_at) VALUES (?, ?)").bind(uid, now).run();
}

/** Adds progress to every active quest that uses one of the metrics. */
export async function addProgress(db: D1Database, uid: string, now: number, delta: Delta): Promise<void> {
  const day = dayKey(now);
  const week = weekKey(now);
  const todo: { period: string; def: QuestDef }[] = [
    ...dailyFor(day).map((def) => ({ period: day, def })),
    ...WEEKLY.map((def) => ({ period: week, def })),
  ];
  for (const { period, def } of todo) {
    const inc = delta[def.metric] ?? 0;
    if (inc <= 0) continue;
    await db
      .prepare(
        "INSERT INTO quest_progress (user_id, period, quest_id, progress, claimed) VALUES (?, ?, ?, ?, 0) " +
          "ON CONFLICT(user_id, period, quest_id) DO UPDATE SET progress = progress + excluded.progress",
      )
      .bind(uid, period, def.id, inc)
      .run();
  }
}

export interface QuestView {
  id: string;
  kind: "daily" | "weekly";
  title: { az: string; ru: string };
  target: number;
  progress: number;
  claimed: boolean;
  xp: number;
  qizil: number;
  period: string;
}

export async function listQuests(db: D1Database, uid: string, now: number): Promise<QuestView[]> {
  const day = dayKey(now);
  const week = weekKey(now);
  const rows = await db
    .prepare("SELECT period, quest_id, progress, claimed FROM quest_progress WHERE user_id = ? AND period IN (?, ?)")
    .bind(uid, day, week)
    .all<{ period: string; quest_id: string; progress: number; claimed: number }>();
  const get = (period: string, id: string) => rows.results.find((r) => r.period === period && r.quest_id === id);
  const view = (kind: "daily" | "weekly", period: string, def: QuestDef): QuestView => {
    const r = get(period, def.id);
    return {
      id: def.id,
      kind,
      title: def.title,
      target: def.target,
      progress: Math.min(def.target, r?.progress ?? 0),
      claimed: !!r?.claimed,
      xp: def.xp,
      qizil: def.qizil,
      period,
    };
  };
  return [
    ...dailyFor(day).map((d) => view("daily", day, d)),
    ...WEEKLY.map((w) => view("weekly", week, w)),
  ];
}

export type ClaimResult = { ok: true; xp: number; qizil: number } | { ok: false; reason: "unknown" | "not_ready" | "claimed" };

export async function claimQuest(db: D1Database, uid: string, questId: string, now: number): Promise<ClaimResult> {
  const day = dayKey(now);
  const week = weekKey(now);
  const daily = dailyFor(day).find((d) => d.id === questId);
  const weekly = WEEKLY.find((w) => w.id === questId);
  const def = daily ?? weekly;
  if (!def) return { ok: false, reason: "unknown" };
  const period = daily ? day : week;
  // the claim itself is the condition: only a finished quest that was not claimed yet flips
  const res = await db
    .prepare("UPDATE quest_progress SET claimed = 1 WHERE user_id = ? AND period = ? AND quest_id = ? AND claimed = 0 AND progress >= ?")
    .bind(uid, period, def.id, def.target)
    .run();
  if ((res.meta.changes ?? 0) !== 1) {
    const row = await db
      .prepare("SELECT claimed FROM quest_progress WHERE user_id = ? AND period = ? AND quest_id = ?")
      .bind(uid, period, def.id)
      .first<{ claimed: number }>();
    return { ok: false, reason: row?.claimed ? "claimed" : "not_ready" };
  }
  const ref = `quest:${period}:${def.id}:${uid}`;
  await credit(db, uid, "xp", def.xp, ref + ":xp", "quest", now);
  if (def.qizil > 0) await credit(db, uid, "qizil", def.qizil, ref + ":qizil", "quest", now);
  if (daily) {
    await ensureStats(db, uid, now);
    await db.prepare("UPDATE user_stats SET daily_claims = daily_claims + 1, updated_at = ? WHERE user_id = ?").bind(now, uid).run();
  }
  await checkAchievements(db, uid, now);
  return { ok: true, xp: def.xp, qizil: def.qizil };
}
