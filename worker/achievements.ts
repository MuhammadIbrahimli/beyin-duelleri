// Achievements: the objective counters come from the server (user_stats, ratings, friends). An achievement is unlocked
// once (a row with a primary key) and its reward is credited with a unique reference, so it is never given twice.
import { ACHIEVEMENTS, RARITY_ORDER, type AchStat, type AchievementDef } from "../config/achievements";
import { credit } from "./economy-core";

export async function statsOf(db: D1Database, uid: string): Promise<Record<AchStat, number>> {
  const s = await db
    .prepare("SELECT wins, matches, stage_wins, marafon_best, daily_claims FROM user_stats WHERE user_id = ?")
    .bind(uid)
    .first<{ wins: number; matches: number; stage_wins: number; marafon_best: number; daily_claims: number }>();
  const r = await db
    .prepare("SELECT peak, best_streak FROM ratings WHERE user_id = ?")
    .bind(uid)
    .first<{ peak: number; best_streak: number }>();
  const f = await db.prepare("SELECT COUNT(*) AS n FROM friends WHERE user_id = ?").bind(uid).first<{ n: number }>();
  return {
    wins: s?.wins ?? 0,
    matches: s?.matches ?? 0,
    best_streak: r?.best_streak ?? 0,
    stage_wins: s?.stage_wins ?? 0,
    peak_rating: r?.peak ?? 0,
    marafon_best: s?.marafon_best ?? 0,
    daily_claims: s?.daily_claims ?? 0,
    friends: f?.n ?? 0,
  };
}

/** Unlocks every achievement whose objective is met. Returns the ids unlocked by this call. */
export async function checkAchievements(db: D1Database, uid: string, now: number): Promise<string[]> {
  const stats = await statsOf(db, uid);
  const unlocked: string[] = [];
  for (const def of ACHIEVEMENTS) {
    if (stats[def.stat] < def.target) continue;
    const ins = await db
      .prepare("INSERT OR IGNORE INTO achievements (user_id, ach_id, unlocked_at) VALUES (?, ?, ?)")
      .bind(uid, def.id, now)
      .run();
    if ((ins.meta.changes ?? 0) !== 1) continue; // already unlocked earlier
    unlocked.push(def.id);
    const ref = `ach:${def.id}:${uid}`;
    if (def.xp > 0) await credit(db, uid, "xp", def.xp, ref + ":xp", "achievement", now);
    if (def.qizil > 0) await credit(db, uid, "qizil", def.qizil, ref + ":qizil", "achievement", now);
  }
  return unlocked;
}

export interface AchievementView {
  id: string;
  title: { az: string; ru: string };
  rarity: string;
  unlocked: boolean;
  unlockedAt: number | null;
  value: number;
  target: number;
  xp: number;
  qizil: number;
}

export async function listAchievements(db: D1Database, uid: string): Promise<AchievementView[]> {
  const stats = await statsOf(db, uid);
  const rows = await db
    .prepare("SELECT ach_id, unlocked_at FROM achievements WHERE user_id = ?")
    .bind(uid)
    .all<{ ach_id: string; unlocked_at: number }>();
  const byId = new Map(rows.results.map((r) => [r.ach_id, r.unlocked_at]));
  return ACHIEVEMENTS.map((def: AchievementDef) => ({
    id: def.id,
    title: def.title,
    rarity: def.rarity,
    unlocked: byId.has(def.id),
    unlockedAt: byId.get(def.id) ?? null,
    value: Math.min(def.target, stats[def.stat]),
    target: def.target,
    xp: def.xp,
    qizil: def.qizil,
  })).sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || RARITY_ORDER.indexOf(b.rarity as never) - RARITY_ORDER.indexOf(a.rarity as never));
}
