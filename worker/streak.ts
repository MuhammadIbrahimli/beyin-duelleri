// Streak milestones of the daily test: 3, 7, 14, 30, 60 and 100 days. Each one is claimed once; a broken streak
// keeps the claimed rewards. The current streak comes from the daily-test history (with the existing freeze rule).
import { STREAK_MILESTONES } from "../config/streak";
import { streakWithFreeze } from "../shared/streak";
import { todayBaku } from "../shared/experiments";
import { credit } from "./economy-core";

export async function streakState(db: D1Database, uid: string, now: number) {
  const today = todayBaku(now);
  const rows = await db.prepare("SELECT date FROM daily WHERE user_id = ? ORDER BY date DESC LIMIT 400").bind(uid).all<{ date: string }>();
  const streak = streakWithFreeze(rows.results.map((r) => r.date), today).streak;
  const claimed = await db.prepare("SELECT days FROM streak_claims WHERE user_id = ?").bind(uid).all<{ days: number }>();
  const got = new Set(claimed.results.map((r) => r.days));
  return {
    streak,
    milestones: STREAK_MILESTONES.map((m) => ({
      days: m.days,
      xp: m.xp,
      qizil: m.qizil,
      reached: streak >= m.days || got.has(m.days),
      claimed: got.has(m.days),
    })),
  };
}

export type StreakClaim = { ok: true; xp: number; qizil: number } | { ok: false; reason: "unknown" | "not_reached" | "claimed" };

export async function claimStreak(db: D1Database, uid: string, days: number, now: number): Promise<StreakClaim> {
  const m = STREAK_MILESTONES.find((x) => x.days === days);
  if (!m) return { ok: false, reason: "unknown" };
  const state = await streakState(db, uid, now);
  const reached = state.milestones.find((x) => x.days === days)?.reached;
  if (!reached) return { ok: false, reason: "not_reached" };
  // the claim row is the condition: one claim per milestone, ever
  const ins = await db.prepare("INSERT OR IGNORE INTO streak_claims (user_id, days, claimed_at) VALUES (?, ?, ?)").bind(uid, days, now).run();
  if ((ins.meta.changes ?? 0) !== 1) return { ok: false, reason: "claimed" };
  await credit(db, uid, "xp", m.xp, `streak:${uid}:${days}:xp`, "streak", now);
  await credit(db, uid, "qizil", m.qizil, `streak:${uid}:${days}:qizil`, "streak", now);
  return { ok: true, xp: m.xp, qizil: m.qizil };
}
