// Seasons (30 days) and events. The season is a function of the Baku date, so there is no job to run.
// When a player is first seen in a new season, the previous season is summarised (season_results) and the rating
// moves a little toward the starting rating, once. Progress and history are kept: nothing is deleted or reset.
import { EVENTS, SEASON } from "../config/seasons";
import { RATING } from "../config/rating";
import { dayKey } from "./calendar";
import { credit } from "./economy-core";
import { seasonRewardFor } from "../config/season-rewards";

const DAY = 24 * 60 * 60 * 1000;
const dayIdx = (d: string) => Math.round(Date.parse(d + "T00:00:00Z") / DAY);
const iso = (idx: number) => new Date(idx * DAY).toISOString().slice(0, 10);

export function seasonFor(now: number) {
  const d = dayIdx(dayKey(now)) - dayIdx(SEASON.startDate);
  if (d < 0) return null;
  const n = Math.floor(d / SEASON.lengthDays) + 1;
  const startIdx = dayIdx(SEASON.startDate) + (n - 1) * SEASON.lengthDays;
  const endIdx = startIdx + SEASON.lengthDays - 1;
  return { id: `S${n}`, n, start: iso(startIdx), end: iso(endIdx), daysLeft: Math.max(0, endIdx - dayIdx(dayKey(now))) };
}

export function activeEvents(now: number) {
  const today = dayKey(now);
  return EVENTS.filter((e) => e.enabled && e.from <= today && today <= e.to).map((e) => ({ id: e.id, title: e.title, description: e.description, to: e.to, xpMultiplier: e.xpMultiplier }));
}

/** XP multiplier of the events running now (1 when none runs). */
export function eventXpMultiplier(now: number): number {
  return activeEvents(now).reduce((m, e) => Math.max(m, e.xpMultiplier), 1);
}

/** Once per season: summary of the previous season, then a soft rating correction. Safe to call often. */
export async function applySeasonCorrection(db: D1Database, uid: string, now: number): Promise<void> {
  const cur = seasonFor(now);
  if (!cur) return;
  const st = await db.prepare("SELECT season_id FROM season_state WHERE user_id = ?").bind(uid).first<{ season_id: string }>();
  if (!st) {
    await db.prepare("INSERT OR IGNORE INTO season_state (user_id, season_id) VALUES (?, ?)").bind(uid, cur.id).run();
    return;
  }
  if (st.season_id === cur.id) return;
  // the change is claimed by the condition: only the first caller of a season moves the rating
  const claim = await db
    .prepare("UPDATE season_state SET season_id = ? WHERE user_id = ? AND season_id = ?")
    .bind(cur.id, uid, st.season_id)
    .run();
  if ((claim.meta.changes ?? 0) !== 1) return;
  const n = Number(st.season_id.slice(1));
  const prevStart = dayIdx(SEASON.startDate) + (n - 1) * SEASON.lengthDays;
  const from = new Date(prevStart * DAY).getTime();
  const to = from + SEASON.lengthDays * DAY;
  const rating = await db.prepare("SELECT rating, peak FROM ratings WHERE user_id = ?").bind(uid).first<{ rating: number; peak: number }>();
  if (!rating) return;
  const played = await db
    .prepare("SELECT COUNT(*) AS n, SUM(CASE WHEN (user0 = ? AND winner = 0) OR (user1 = ? AND winner = 1) THEN 1 ELSE 0 END) AS w FROM matches " +
      "WHERE rated = 1 AND (user0 = ? OR user1 = ?) AND created_at >= ? AND created_at < ?")
    .bind(uid, uid, uid, uid, from, to)
    .first<{ n: number; w: number | null }>();
  const seasonPeak = await db
    .prepare("SELECT MAX(rating_after) AS p FROM rating_history WHERE user_id = ? AND created_at >= ? AND created_at < ?")
    .bind(uid, from, to)
    .first<{ p: number | null }>();
  await db
    .prepare("INSERT OR IGNORE INTO season_results (user_id, season_id, peak, rating_end, played, wins, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(uid, st.season_id, Math.max(seasonPeak?.p ?? 0, rating.rating), rating.rating, played?.n ?? 0, played?.w ?? 0, now)
    .run();
  // a season reward once per season: Qızıl, and a reward-only title at the top thresholds
  const reward = seasonRewardFor(Math.max(seasonPeak?.p ?? 0, rating.rating));
  if (reward) {
    await credit(db, uid, "qizil", reward.qizil, `season:${st.season_id}:${uid}:qizil`, "season", now);
    if (reward.item) await db.prepare("INSERT OR IGNORE INTO inventory (user_id, item_id, acquired_at) VALUES (?, ?, ?)").bind(uid, reward.item, now).run();
  }
  const corrected = Math.max(RATING.floor, Math.round(RATING.start + (rating.rating - RATING.start) * SEASON.softKeep));
  await db.prepare("UPDATE ratings SET rating = ?, updated_at = ? WHERE user_id = ?").bind(corrected, now, uid).run();
}

export async function seasonHistory(db: D1Database, uid: string) {
  const rows = await db
    .prepare("SELECT season_id, peak, rating_end, played, wins FROM season_results WHERE user_id = ? ORDER BY season_id DESC LIMIT 20")
    .bind(uid)
    .all();
  return rows.results;
}
