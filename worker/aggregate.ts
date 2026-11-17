import { CITY_CODES, PERCENTILE_MIN_RUNS } from "../config/cities";
import { EXPERIMENTS } from "../shared/experiments";
import { buildCityStats, toQuantiles } from "../shared/stats";

const WINDOW_DAYS_PCT = 30;
const SAMPLE_CAP = 5000;
const CITY_WINDOW_DAYS = 7;

/** Run from the cron trigger: refreshes the percentile tables and the city ranking. */
export async function aggregate(db: D1Database, now = Date.now()): Promise<void> {
  const since = now - WINDOW_DAYS_PCT * 86400000;
  const date = new Date(now).toISOString().slice(0, 10);
  const stmts: D1PreparedStatement[] = [
    db.prepare("DELETE FROM percentiles"),
    db.prepare("DELETE FROM city_stats WHERE date = ?").bind(date),
  ];

  for (const e of EXPERIMENTS) {
    const { results } = await db
      .prepare(
        `SELECT r.primary_score AS score, r.device_class AS dc, u.city_code AS city, r.finished_at AS fin
         FROM runs r JOIN users u ON u.id = r.user_id
         WHERE r.experiment_id = ? AND r.status = 'finished' AND r.valid = 1 AND r.finished_at >= ?
         ORDER BY r.finished_at DESC LIMIT ?`,
      )
      .bind(e.id, since, SAMPLE_CAP)
      .all<{ score: number; dc: string; city: string | null; fin: number }>();

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

    const cityRows = results
      .filter((r) => r.fin >= now - CITY_WINDOW_DAYS * 86400000)
      .map((r) => ({ city: r.city && (CITY_CODES as readonly string[]).includes(r.city) ? r.city : null, score: r.score }));
    for (const s of buildCityStats(cityRows)) {
      stmts.push(
        db
          .prepare("INSERT INTO city_stats (date, experiment_id, city_code, n, median, p25, p75) VALUES (?,?,?,?,?,?,?)")
          .bind(date, e.id, s.city, s.n, s.median, s.p25, s.p75),
      );
    }
  }
  await db.batch(stmts);
}
