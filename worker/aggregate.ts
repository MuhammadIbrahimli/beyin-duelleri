import { PERCENTILE_MIN_RUNS } from "../config/cities";
import { EXPERIMENTS } from "../shared/experiments";
import { toQuantiles } from "../shared/stats";

const WINDOW_DAYS_PCT = 30;
const SAMPLE_CAP = 5000;

/** Run from the cron trigger: refreshes the percentile tables (the Beyin balı rankings are live, not cron-based). */
export async function aggregate(db: D1Database, now = Date.now()): Promise<void> {
  const since = now - WINDOW_DAYS_PCT * 86400000;
  const stmts: D1PreparedStatement[] = [
    db.prepare("DELETE FROM percentiles"),
  ];

  for (const e of EXPERIMENTS) {
    const { results } = await db
      .prepare(
        `SELECT ${e.direction === "lower" ? "MIN" : "MAX"}(r.primary_score) AS score, MAX(r.device_class) AS dc
         FROM runs r
         WHERE r.experiment_id = ? AND r.status = 'finished' AND r.valid = 1 AND r.finished_at >= ?
         GROUP BY r.user_id ORDER BY MAX(r.finished_at) DESC LIMIT ?`,
      )
      .bind(e.id, since, SAMPLE_CAP)
      .all<{ score: number; dc: string }>(); // one best result per person, so heavy players do not count many times

    const groups = new Map<string, number[]>([["all", []]]);
    for (const r of results) {
      groups.get("all")!.push(r.score);
      (groups.get(r.dc) ?? groups.set(r.dc, []).get(r.dc)!).push(r.score);
    }
    for (const [dc, scores] of groups) {
      if (scores.length < PERCENTILE_MIN_RUNS) continue;
      scores.sort((a, b) => a - b);
      stmts.push(
        db
          .prepare("INSERT INTO percentiles (experiment_id, device_class, n, sorted_json, updated_at) VALUES (?,?,?,?,?)")
          .bind(e.id, dc, scores.length, JSON.stringify(toQuantiles(scores)), now),
      );
    }
  }
  await db.batch(stmts);
}
