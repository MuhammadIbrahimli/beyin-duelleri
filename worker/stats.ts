// Counters per account after a finished human match: they feed quests and achievements.
// Called once per stored match (see worker/match-store.ts), so a repeated store adds nothing.
import type { MatchResult } from "./match-store";
import { addProgress } from "./quests";
import { checkAchievements } from "./achievements";

export async function recordMatch(db: D1Database, r: MatchResult, now: number): Promise<void> {
  for (const seat of [0, 1] as const) {
    const uid = r.ids[seat];
    if (!uid || r.bots[seat]) continue;
    const won = r.winner === seat;
    const training = r.mode === "training";
    const d = {
      matches: training ? 0 : 1,
      wins: !training && won ? 1 : 0,
      stage_wins: r.history.filter((h) => h.winner === seat).length,
      training: training ? 1 : 0,
      friendly: r.mode === "friendly" ? 1 : 0,
      rated_wins: r.mode === "rated" && won ? 1 : 0,
    };
    await db.prepare("INSERT OR IGNORE INTO user_stats (user_id, updated_at) VALUES (?, ?)").bind(uid, now).run();
    await db
      .prepare(
        "UPDATE user_stats SET matches = matches + ?, wins = wins + ?, stage_wins = stage_wins + ?, training = training + ?, " +
          "friendly = friendly + ?, rated_wins = rated_wins + ?, updated_at = ? WHERE user_id = ?",
      )
      .bind(d.matches, d.wins, d.stage_wins, d.training, d.friendly, d.rated_wins, now, uid)
      .run();
    await addProgress(db, uid, now, {
      matches: d.matches,
      stage_wins: d.stage_wins,
      training: d.training,
      friendly: d.friendly,
      rated_wins: d.rated_wins,
    });
    await checkAchievements(db, uid, now);
  }
}
