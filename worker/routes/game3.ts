// API for streak rewards, friend extras (history, reactions, team invitations), the skill chart, notifications,
// the daily-test board, the university board and the players around me. Mounted before routes/game2.ts, because
// /leaderboards/daily and /leaderboards/universities must not be taken by the generic /leaderboards/:kind route.
import { Hono } from "hono";
import { FRIEND_REACTIONS } from "../../config/streak";
import type { AppEnv } from "../env";
import { auth } from "../middleware/auth";
import { claimStreak, streakState } from "../streak";
import { areFriends, headToHead, inviteToTeam, myTeamInvites, react, respondInvite } from "../friend-extras";
import { skillsFor } from "../skills";
import { notificationsFor } from "../notifications";
import { dailyBoard } from "../daily-board";
import { teamWeeks } from "../team-week";
import { credit } from "../economy-core";
import { todayBaku } from "../../shared/experiments";
import { DAILY_REWARD } from "../../config/streak";

export const game3Routes = new Hono<AppEnv>();

const SRC: Record<string, string> = {
  rating: "SELECT user_id AS id, rating AS value FROM ratings",
  beyin: "SELECT user_id AS id, score AS value FROM user_scores",
  marafon: "SELECT user_id AS id, MAX(score) AS value FROM marafon_runs WHERE status = 'ended' GROUP BY user_id",
};

game3Routes.get("/streak", auth, async (c) => c.json(await streakState(c.env.DB, c.get("userId"), Date.now())));

game3Routes.post("/streak/claim", auth, async (c) => {
  const b = await c.req.json<{ days?: number }>().catch(() => ({}) as { days?: number });
  const r = await claimStreak(c.env.DB, c.get("userId"), Number(b.days), Date.now());
  if (!r.ok) return c.json({ error: r.reason }, r.reason === "unknown" ? 404 : 409);
  return c.json(r);
});

game3Routes.post("/friends/react", auth, async (c) => {
  const b = await c.req.json<{ friendId?: string; reaction?: string }>().catch(() => ({}) as { friendId?: string; reaction?: string });
  const r = await react(c.env.DB, c.get("userId"), String(b.friendId ?? ""), b.reaction, Date.now());
  if (!r.ok) return c.json({ error: r.reason, allowed: FRIEND_REACTIONS }, r.reason === "not_friend" ? 403 : 400);
  return c.json({ ok: true });
});

/** The last matches between me and one friend. Only friends can see it. */
game3Routes.get("/friends/:id/history", auth, async (c) => {
  const uid = c.get("userId");
  const fid = c.req.param("id");
  if (!(await areFriends(c.env.DB, uid, fid))) return c.json({ error: "not_friend" }, 403);
  return c.json({ matches: await headToHead(c.env.DB, uid, fid) });
});

game3Routes.post("/teams/invite", auth, async (c) => {
  const b = await c.req.json<{ friendId?: string; teamId?: string }>().catch(() => ({}) as { friendId?: string; teamId?: string });
  const r = await inviteToTeam(c.env.DB, c.get("userId"), String(b.friendId ?? ""), String(b.teamId ?? ""), Date.now());
  if (!r.ok) return c.json({ error: r.reason }, r.reason === "not_member" ? 403 : 409);
  return c.json({ ok: true, id: r.id });
});

game3Routes.get("/teams/invites", auth, async (c) => c.json({ invites: await myTeamInvites(c.env.DB, c.get("userId")) }));

game3Routes.post("/teams/invites/:id", auth, async (c) => {
  const b = await c.req.json<{ accept?: boolean }>().catch(() => ({}) as { accept?: boolean });
  const r = await respondInvite(c.env.DB, c.get("userId"), c.req.param("id"), b.accept === true, Date.now());
  return r.ok ? c.json(r) : c.json({ error: "not_found" }, 404);
});

/** The daily-test reward: once per Baku day, only after today's test is done. */
game3Routes.post("/daily/reward", auth, async (c) => {
  const uid = c.get("userId");
  const day = todayBaku(Date.now());
  const done = await c.env.DB.prepare("SELECT 1 AS x FROM daily WHERE user_id = ? AND date = ?").bind(uid, day).first();
  if (!done) return c.json({ granted: false, reason: "not_done" });
  const ok = await credit(c.env.DB, uid, "xp", DAILY_REWARD.xp, `daily:${day}:${uid}:xp`, "daily", Date.now());
  if (ok) await credit(c.env.DB, uid, "qizil", DAILY_REWARD.qizil, `daily:${day}:${uid}:qizil`, "daily", Date.now());
  return c.json({ granted: ok, xp: ok ? DAILY_REWARD.xp : 0, qizil: ok ? DAILY_REWARD.qizil : 0 });
});

game3Routes.get("/skills", auth, async (c) => c.json({
  skills: await skillsFor(c.env.DB, c.get("userId")),
  note: "Training profile from your real results. Not a medical or scientific measure of intelligence.",
}));

game3Routes.get("/notifications", auth, async (c) => {
  const since = Number(c.req.query("since")) || 0;
  return c.json(await notificationsFor(c.env.DB, c.get("userId"), since, Date.now()));
});

game3Routes.get("/leaderboards/daily", auth, async (c) => {
  const scope = (["world", "friends", "city"] as const).includes(c.req.query("scope") as "world") ? String(c.req.query("scope")) : "world";
  const r = await dailyBoard(c.env.DB, c.get("userId"), scope, Date.now());
  return r ? c.json(r) : c.json({ error: "no_daily" }, 404);
});

/** The weekly team competition: this week and the previous one. */
game3Routes.get("/leaderboards/team-week", auth, async (c) => c.json(await teamWeeks(c.env.DB, Date.now())));

/** Verified university teams only (the list is in config/universities.ts). */
game3Routes.get("/leaderboards/universities", auth, async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT t.id, t.name, COUNT(m.user_id) AS members, ROUND(AVG(COALESCE(r.rating, 300))) AS avg_rating FROM teams t " +
      "JOIN team_members m ON m.team_id = t.id LEFT JOIN ratings r ON r.user_id = m.user_id " +
      "WHERE t.kind = 'university' AND t.verified = 1 GROUP BY t.id HAVING COUNT(m.user_id) >= 3 ORDER BY avg_rating DESC, t.id LIMIT 20",
  ).all<{ id: string; name: string; members: number; avg_rating: number }>();
  return c.json({ rows: rows.results.map((r, i) => ({ rank: i + 1, id: r.id, name: r.name, members: r.members, avgRating: r.avg_rating })) });
});

/** Two players above and two below me in a board (the player's own place is never hidden). */
game3Routes.get("/leaderboards/:kind/around", auth, async (c) => {
  const kind = c.req.param("kind");
  const src = SRC[kind];
  if (!src) return c.json({ error: "unknown_board" }, 404);
  const uid = c.get("userId");
  const mine = await c.env.DB.prepare(`WITH src AS (${src}) SELECT value FROM src WHERE id = ?`).bind(uid).first<{ value: number }>();
  if (!mine) return c.json({ me: null, above: [], below: [] });
  const above = await c.env.DB.prepare(
    `WITH src AS (${src}) SELECT src.id, u.nickname AS nick, src.value FROM src JOIN users u ON u.id = src.id WHERE src.value > ? ORDER BY src.value ASC, src.id LIMIT 2`,
  ).bind(mine.value).all<{ id: string; nick: string; value: number }>();
  const below = await c.env.DB.prepare(
    `WITH src AS (${src}) SELECT src.id, u.nickname AS nick, src.value FROM src JOIN users u ON u.id = src.id WHERE src.value < ? AND src.id <> ? ORDER BY src.value DESC, src.id LIMIT 2`,
  ).bind(mine.value, uid).all<{ id: string; nick: string; value: number }>();
  const ahead = await c.env.DB.prepare(`WITH src AS (${src}) SELECT COUNT(*) AS n FROM src WHERE value > ?`).bind(mine.value).first<{ n: number }>();
  const pack = (r: { id: string; nick: string; value: number }) => ({ nick: r.nick, value: r.value });
  return c.json({
    me: { rank: (ahead?.n ?? 0) + 1, value: mine.value, nick: await nickOf(c.env.DB, uid) },
    above: above.results.map(pack).reverse(),
    below: below.results.map(pack),
  });
});

async function nickOf(db: D1Database, uid: string): Promise<string> {
  const r = await db.prepare("SELECT nickname FROM users WHERE id = ?").bind(uid).first<{ nickname: string }>();
  return r?.nickname ?? "";
}
