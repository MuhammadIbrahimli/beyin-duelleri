// Skill chart: five categories from the player's REAL results. Each experiment counts with its best valid result,
// turned into points by the same curve as Beyin balı. A category needs enough played experiments; otherwise it says so.
// This is a training profile, not a medical or scientifically validated measure of intelligence.
import { CATEGORIES } from "../shared/categories";
import { byId } from "../shared/experiments";
import { pointsFor } from "../shared/points";

export const SKILL_MIN_EXPERIMENTS = 3;

export async function skillsFor(db: D1Database, uid: string) {
  const rows = await db
    .prepare("SELECT experiment_id, primary_score FROM runs WHERE user_id = ? AND valid = 1 AND primary_score IS NOT NULL AND status = 'finished'")
    .bind(uid)
    .all<{ experiment_id: number; primary_score: number }>();
  // best raw value per experiment, in the direction the experiment defines
  const best = new Map<string, number>();
  for (const r of rows.results) {
    const meta = byId(r.experiment_id);
    if (!meta) continue;
    const prev = best.get(meta.slug);
    const better = prev === undefined || (meta.direction === "higher" ? r.primary_score > prev : r.primary_score < prev);
    if (better) best.set(meta.slug, r.primary_score);
  }
  return CATEGORIES.map((c) => {
    const played = c.slugs.filter((s) => best.has(s));
    const points = played.map((s) => pointsFor(s, best.get(s)!));
    const enough = played.length >= SKILL_MIN_EXPERIMENTS;
    return {
      id: c.id,
      played: played.length,
      total: c.slugs.length,
      score: enough ? Math.round(points.reduce((a, b) => a + b, 0) / points.length) : null,
      enough,
    };
  });
}
