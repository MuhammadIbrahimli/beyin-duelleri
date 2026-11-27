// Analytics of the duel modes, quests, shop, Marafon and the first-week funnel. Only stored data is counted;
// nothing is estimated or invented. Used by the owner through GET /api/admin/duel-stats (x-admin-token).
export async function duelStats(db: D1Database, now: number) {
  const since = now - 30 * 24 * 60 * 60 * 1000;
  const byMode = await db
    .prepare("SELECT mode, COUNT(*) AS n FROM matches WHERE created_at >= ? GROUP BY mode")
    .bind(since)
    .all<{ mode: string; n: number }>();
  const totals = await db
    .prepare("SELECT COUNT(*) AS n, SUM(CASE WHEN reason = 'forfeit' THEN 1 ELSE 0 END) AS forfeits, SUM(CASE WHEN reason = 'finished' THEN 1 ELSE 0 END) AS finished, " +
      "SUM(CASE WHEN rated = 1 AND flag = 'repeat' THEN 1 ELSE 0 END) AS flagged FROM matches WHERE created_at >= ?")
    .bind(since)
    .first<{ n: number; forfeits: number; finished: number; flagged: number }>();
  const quests = await db
    .prepare("SELECT COUNT(*) AS n FROM quest_progress WHERE claimed = 1")
    .first<{ n: number }>();
  const achievements = await db
    .prepare("SELECT ach_id, COUNT(*) AS n FROM achievements GROUP BY ach_id ORDER BY n DESC")
    .all<{ ach_id: string; n: number }>();
  const shop = await db
    .prepare("SELECT item_id, COUNT(*) AS n FROM inventory GROUP BY item_id ORDER BY n DESC LIMIT 20")
    .all<{ item_id: string; n: number }>();
  const qizil = await db
    .prepare("SELECT COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0) AS earned, COALESCE(SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END), 0) AS spent " +
      "FROM econ_ledger WHERE currency = 'qizil' AND created_at >= ?")
    .bind(since)
    .first<{ earned: number; spent: number }>();
  const marafon = await db
    .prepare("SELECT COUNT(*) AS runs, COALESCE(AVG(correct), 0) AS avg_correct, COALESCE(MAX(score), 0) AS best_score FROM marafon_runs WHERE status = 'ended' AND started_at >= ?")
    .bind(since)
    .first<{ runs: number; avg_correct: number; best_score: number }>();
  const challenges = await db
    .prepare("SELECT COUNT(*) AS n FROM challenges WHERE created_at >= ?")
    .bind(since)
    .first<{ n: number }>();
  // first-week funnel over every account that played: a first match, a second match, and a return a day later
  const funnel = await db
    .prepare(
      "WITH p AS (SELECT user0 AS u, created_at AS t FROM matches WHERE user0 IS NOT NULL AND mode != 'training' " +
        "UNION ALL SELECT user1, created_at FROM matches WHERE user1 IS NOT NULL AND mode != 'training'), " +
        "f AS (SELECT u, MIN(t) AS first FROM p GROUP BY u) " +
        "SELECT COUNT(*) AS players, " +
        " SUM(CASE WHEN (SELECT COUNT(*) FROM p x WHERE x.u = f.u) >= 2 THEN 1 ELSE 0 END) AS second_match, " +
        " SUM(CASE WHEN EXISTS (SELECT 1 FROM p x WHERE x.u = f.u AND x.t >= f.first + 86400000) THEN 1 ELSE 0 END) AS returned_next_day " +
        "FROM f",
    )
    .first<{ players: number; second_match: number; returned_next_day: number }>();
  const flagged = await db
    .prepare("SELECT id, mode, user0, user1, delta0, delta1, created_at FROM matches WHERE flag IS NOT NULL ORDER BY created_at DESC LIMIT 50")
    .all();
  return {
    windowDays: 30,
    matches: {
      total: totals?.n ?? 0,
      finished: totals?.finished ?? 0,
      forfeits: totals?.forfeits ?? 0,
      byMode: Object.fromEntries(byMode.results.map((r) => [r.mode, r.n])),
      botShare: totals?.n ? Math.round(((byMode.results.find((r) => r.mode === "training")?.n ?? 0) / totals.n) * 1000) / 10 : 0,
      flagged: totals?.flagged ?? 0,
    },
    funnel: {
      players: funnel?.players ?? 0,
      secondMatch: funnel?.second_match ?? 0,
      returnedNextDay: funnel?.returned_next_day ?? 0,
    },
    quests: { claimed: quests?.n ?? 0 },
    achievements: achievements.results,
    shop: { popular: shop.results },
    qizil: { earned30d: qizil?.earned ?? 0, spent30d: qizil?.spent ?? 0 },
    marafon: { runs30d: marafon?.runs ?? 0, avgCorrect: Math.round((marafon?.avg_correct ?? 0) * 10) / 10, bestScore: marafon?.best_score ?? 0 },
    challenges30d: challenges?.n ?? 0,
    suspicious: flagged.results,
  };
}
