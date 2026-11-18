import { EXPERIMENTS } from "../shared/experiments";
import { overallScore, pointsFor } from "../shared/points";

export interface Overall { score: number; played: number; total: number }

/** Recomputes one user's Beyin balı from their best valid result per experiment and stores it. */
export async function updateUserScore(db: D1Database, userId: string, now = Date.now()): Promise<Overall> {
  const { results } = await db
    .prepare("SELECT experiment_id AS e, primary_score AS raw FROM runs WHERE user_id = ? AND status = 'finished' AND valid = 1 ORDER BY finished_at DESC LIMIT 600")
    .bind(userId)
    .all<{ e: number; raw: number }>();
  const best = new Map<number, number>();
  for (const r of results) {
    const slug = EXPERIMENTS.find((x) => x.id === r.e)?.slug;
    if (!slug) continue;
    best.set(r.e, Math.max(best.get(r.e) ?? 0, pointsFor(slug, r.raw)));
  }
  const total = EXPERIMENTS.length;
  const score = overallScore([...best.values()], total);
  await db
    .prepare("INSERT INTO user_scores (user_id, score, played, updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET score = excluded.score, played = excluded.played, updated_at = excluded.updated_at")
    .bind(userId, score, best.size, now)
    .run();
  return { score, played: best.size, total };
}
