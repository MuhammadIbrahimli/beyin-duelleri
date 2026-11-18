import { EXPERIMENTS } from "../shared/experiments";
import { streakWithFreeze } from "../shared/streak";

export const BADGES = ["streak7", "first_duel", "ten_duels", "all_six", "group_leader"] as const;
export type Badge = (typeof BADGES)[number];

const count = async (db: D1Database, sql: string, ...args: unknown[]) =>
  (await db.prepare(sql).bind(...args).first<{ n: number }>())?.n ?? 0;

/** Duels in which the user finished and at least one other player has finished too. */
const COMPLETED_DUELS = `
  SELECT e.duel_id FROM duel_entries e JOIN runs r ON r.id = e.run_id
  WHERE r.user_id = ? AND r.status = 'finished'
    AND (SELECT COUNT(*) FROM duel_entries e2 JOIN runs r2 ON r2.id = e2.run_id
         WHERE e2.duel_id = e.duel_id AND r2.status = 'finished') >= 2`;

/** Checks every badge rule for one user and stores the new ones. Returns the newly earned badge ids. */
export async function awardBadges(db: D1Database, userId: string, today: string, now = Date.now()): Promise<Badge[]> {
  const have = new Set(
    (await db.prepare("SELECT badge FROM user_badges WHERE user_id = ?").bind(userId).all<{ badge: string }>()).results.map((b) => b.badge),
  );
  const earned: Badge[] = [];
  const check = async (b: Badge, test: () => Promise<boolean>) => {
    if (!have.has(b) && (await test())) earned.push(b);
  };

  await check("streak7", async () => {
    const { results } = await db.prepare("SELECT date FROM daily WHERE user_id = ? ORDER BY date DESC LIMIT 60").bind(userId).all<{ date: string }>();
    return streakWithFreeze(results.map((r) => r.date), today).streak >= 7;
  });
  const duels = await count(db, `SELECT COUNT(*) AS n FROM (${COMPLETED_DUELS})`, userId);
  await check("first_duel", async () => duels >= 1);
  await check("ten_duels", async () => duels >= 10);
  await check("all_six", async () =>
    (await count(db, "SELECT COUNT(DISTINCT experiment_id) AS n FROM runs WHERE user_id = ? AND status = 'finished' AND valid = 1", userId)) >= EXPERIMENTS.length);
  await check("group_leader", async () =>
    (await count(db,
      `SELECT COUNT(*) AS n FROM duel_entries e JOIN runs r ON r.id = e.run_id JOIN duels d ON d.id = e.duel_id
       WHERE r.user_id = ? AND d.type = 'group' AND e.rank = 1
         AND (SELECT COUNT(*) FROM duel_entries x JOIN runs rx ON rx.id = x.run_id WHERE x.duel_id = d.id AND rx.status = 'finished') >= 3
         AND (SELECT COUNT(*) FROM duel_entries y WHERE y.duel_id = d.id AND y.rank = 1) = 1`, userId)) > 0);

  if (earned.length) {
    await db.batch(earned.map((b) => db.prepare("INSERT OR IGNORE INTO user_badges (user_id, badge, earned_at) VALUES (?,?,?)").bind(userId, b, now)));
  }
  return earned;
}
