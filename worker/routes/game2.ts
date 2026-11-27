// API for quests, achievements, the shop, Marafon, leaderboards, friends, teams, city battles, seasons and the profile.
// Every number a result depends on is computed on the server. Payments and ads answer 503 while they are off.
import { Hono } from "hono";
import { LEAGUES, RATING } from "../../config/rating";
import { ECONOMY, levelForXp } from "../../config/economy";
import type { AppEnv } from "../env";
import { auth } from "../middleware/auth";
import { balanceOf } from "../economy-core";
import { leagueOf } from "../rating-core";
import { listQuests, claimQuest } from "../quests";
import { listAchievements, statsOf } from "../achievements";
import { catalog, buy, equip, unequip, equippedOf, itemById } from "../shop";
import { startRun, answerRun, stopRun } from "../marafon";
import { addFriend, challenge, incomingChallenges, listFriends, myCode } from "../social";
import { createTeam, joinTeam, myTeams, teamDetail, teamRanking } from "../teams";
import { cityBattle } from "../cities";
import { activeEvents, applySeasonCorrection, seasonFor, seasonHistory } from "../seasons";
import { adsStatus, adsEnabled, createOrder, paymentsEnabled } from "../payments";
import { weekStart } from "../calendar";
import { duelStats } from "../analytics";
import { safeEqual } from "../util";

export const game2Routes = new Hono<AppEnv>();
const PAGE = 20;

/** Switches for the client: what is on and what is off (payments and ads are off until approved). */
game2Routes.get("/features", (c) =>
  c.json({ payments: paymentsEnabled(), ads: adsStatus(), season: seasonFor(Date.now()), events: activeEvents(Date.now()) }));

// ---- quests and achievements ---------------------------------------------------------------------------------------
game2Routes.get("/quests", auth, async (c) => c.json({ quests: await listQuests(c.env.DB, c.get("userId"), Date.now()) }));

game2Routes.post("/quests/:id/claim", auth, async (c) => {
  const r = await claimQuest(c.env.DB, c.get("userId"), c.req.param("id"), Date.now());
  if (!r.ok) return c.json({ error: r.reason }, r.reason === "unknown" ? 404 : 409);
  return c.json({ ok: true, xp: r.xp, qizil: r.qizil });
});

game2Routes.get("/achievements", auth, async (c) => c.json({ achievements: await listAchievements(c.env.DB, c.get("userId")) }));

// ---- shop -----------------------------------------------------------------------------------------------------------
game2Routes.get("/shop", auth, async (c) => c.json(await catalog(c.env.DB, c.get("userId"))));

game2Routes.post("/shop/buy", auth, async (c) => {
  const b = await c.req.json<{ item?: string }>().catch(() => ({}) as { item?: string });
  const r = await buy(c.env.DB, c.get("userId"), String(b.item ?? ""), Date.now());
  if (!r.ok) return c.json({ error: r.reason }, r.reason === "unknown" ? 404 : r.reason === "owned" ? 409 : 402);
  return c.json({ ok: true, balance: r.balance });
});

game2Routes.post("/shop/equip", auth, async (c) => {
  const b = await c.req.json<{ item?: string }>().catch(() => ({}) as { item?: string });
  const r = await equip(c.env.DB, c.get("userId"), String(b.item ?? ""));
  if (!r.ok) return c.json({ error: r.reason }, r.reason === "unknown" ? 404 : 403);
  return c.json({ ok: true });
});

game2Routes.post("/shop/unequip", auth, async (c) => {
  const b = await c.req.json<{ slot?: string }>().catch(() => ({}) as { slot?: string });
  if (!(await unequip(c.env.DB, c.get("userId"), String(b.slot ?? "")))) return c.json({ error: "bad_slot" }, 400);
  return c.json({ ok: true });
});

/** A real-money order. Refused while payments are off: nothing is charged. */
game2Routes.post("/shop/order", auth, async (c) => {
  const b = await c.req.json<{ item?: string }>().catch(() => ({}) as { item?: string });
  const item = itemById(String(b.item ?? ""));
  if (!item) return c.json({ error: "unknown" }, 404);
  const r = await createOrder(c.env.DB, c.get("userId"), item.id, item.price, Date.now());
  if (!r.ok) return c.json({ error: r.reason }, 503);
  return c.json({ ok: true, orderId: r.id });
});

/** Rewarded ads: refused while ads are off. No reward is ever given for a view that did not happen. */
game2Routes.post("/ads/reward", auth, async (c) => {
  if (!adsEnabled()) return c.json({ error: "ads_disabled" }, 503);
  return c.json({ error: "no_provider" }, 503);
});

// ---- Marafon --------------------------------------------------------------------------------------------------------
game2Routes.post("/marafon/start", auth, async (c) => c.json(await startRun(c.env.DB, c.get("userId"), Date.now())));

game2Routes.post("/marafon/answer", auth, async (c) => {
  const b = await c.req.json<{ runId?: string; idx?: number; choice?: number }>().catch(() => ({}) as { runId?: string; idx?: number; choice?: number });
  const r = await answerRun(c.env, c.get("userId"), String(b.runId ?? ""), Number(b.idx), Number(b.choice), Date.now());
  if (!r.ok) return c.json({ error: r.reason }, r.reason === "not_found" ? 404 : 409);
  return c.json({ right: r.correct, why: r.why, over: r.over, best: r.best, ...r.view });
});

game2Routes.post("/marafon/stop", auth, async (c) => {
  const b = await c.req.json<{ runId?: string }>().catch(() => ({}) as { runId?: string });
  const r = await stopRun(c.env, c.get("userId"), String(b.runId ?? ""), Date.now());
  if (!r.ok) return c.json({ error: r.reason }, 404);
  return c.json({ ok: true, score: r.score, best: r.best });
});

// ---- leaderboards ---------------------------------------------------------------------------------------------------
type Scope = "world" | "week" | "friends";
const SOURCES: Record<string, (scope: Scope, now: number) => { sql: string; binds: unknown[] } | null> = {
  rating: () => ({ sql: "SELECT user_id AS id, rating AS value FROM ratings", binds: [] }),
  beyin: () => ({ sql: "SELECT user_id AS id, score AS value FROM user_scores", binds: [] }),
  marafon: (scope, now) =>
    scope === "week"
      ? { sql: "SELECT user_id AS id, MAX(score) AS value FROM marafon_runs WHERE status = 'ended' AND started_at >= ? GROUP BY user_id", binds: [weekStart(now)] }
      : { sql: "SELECT user_id AS id, MAX(score) AS value FROM marafon_runs WHERE status = 'ended' GROUP BY user_id", binds: [] },
};

game2Routes.get("/leaderboards/:kind", auth, async (c) => {
  const kind = c.req.param("kind");
  const uid = c.get("userId");
  const page = Math.max(1, Math.floor(Number(c.req.query("page")) || 1));
  const scope = (["world", "week", "friends"].includes(String(c.req.query("scope"))) ? c.req.query("scope") : "world") as Scope;
  if (kind === "teams") {
    const rows = await teamRanking(c.env.DB, page, PAGE);
    return c.json({ kind, scope: "world", page, rows, me: null });
  }
  const src = SOURCES[kind]?.(scope, Date.now());
  if (!src) return c.json({ error: "unknown_board" }, 404);
  if (scope === "week" && kind !== "marafon") return c.json({ error: "no_week_board" }, 400);
  const friendsWhere = scope === "friends" ? " WHERE src.id IN (SELECT friend_id FROM friends WHERE user_id = ?) OR src.id = ?" : "";
  const friendBinds = scope === "friends" ? [uid, uid] : [];
  const total = await c.env.DB
    .prepare(`WITH src AS (${src.sql}) SELECT COUNT(*) AS n FROM src${friendsWhere}`)
    .bind(...src.binds, ...friendBinds)
    .first<{ n: number }>();
  const rows = await c.env.DB
    .prepare(`WITH src AS (${src.sql}) SELECT src.id, u.nickname AS nick, src.value FROM src JOIN users u ON u.id = src.id${friendsWhere} ORDER BY src.value DESC, src.id LIMIT ? OFFSET ?`)
    .bind(...src.binds, ...friendBinds, PAGE, (page - 1) * PAGE)
    .all<{ id: string; nick: string; value: number }>();
  const mine = await c.env.DB
    .prepare(`WITH src AS (${src.sql}) SELECT value FROM src WHERE id = ?`)
    .bind(...src.binds, uid)
    .first<{ value: number }>();
  let me: { rank: number; value: number } | null = null;
  if (mine) {
    const above = await c.env.DB
      .prepare(`WITH src AS (${src.sql}) SELECT COUNT(*) AS n FROM src WHERE value > ?${scope === "friends" ? " AND (src.id IN (SELECT friend_id FROM friends WHERE user_id = ?) OR src.id = ?)" : ""}`)
      .bind(...src.binds, mine.value, ...friendBinds)
      .first<{ n: number }>();
    me = { rank: (above?.n ?? 0) + 1, value: mine.value };
  }
  return c.json({
    kind,
    scope,
    page,
    pages: Math.max(1, Math.ceil((total?.n ?? 0) / PAGE)),
    rows: rows.results.map((r, i) => ({ rank: (page - 1) * PAGE + i + 1, id: r.id === uid ? "me" : null, nick: r.nick, value: r.value })),
    me,
  });
});

// ---- friends --------------------------------------------------------------------------------------------------------
game2Routes.get("/friends", auth, async (c) => {
  const uid = c.get("userId");
  const now = Date.now();
  return c.json({ code: await myCode(c.env.DB, uid, now), friends: await listFriends(c.env.DB, uid), challenges: await incomingChallenges(c.env.DB, uid, now) });
});

game2Routes.post("/friends/add", auth, async (c) => {
  const b = await c.req.json<{ code?: string }>().catch(() => ({}) as { code?: string });
  const r = await addFriend(c.env.DB, c.get("userId"), String(b.code ?? ""), Date.now());
  if (!r.ok) return c.json({ error: r.reason }, r.reason === "not_found" ? 404 : 400);
  return c.json({ ok: true });
});

game2Routes.post("/friends/challenge", auth, async (c) => {
  const b = await c.req.json<{ friendId?: string }>().catch(() => ({}) as { friendId?: string });
  const r = await challenge(c.env, c.get("userId"), String(b.friendId ?? ""), Date.now());
  if (!r.ok) return c.json({ error: r.reason }, r.reason === "not_friend" ? 403 : 503);
  return c.json({ code: r.code, mode: "friendly" });
});

// ---- teams ----------------------------------------------------------------------------------------------------------
game2Routes.get("/teams", auth, async (c) => c.json({ teams: await myTeams(c.env.DB, c.get("userId")) }));

game2Routes.post("/teams", auth, async (c) => {
  const b = await c.req.json<{ name?: unknown; kind?: unknown }>().catch(() => ({}) as { name?: unknown; kind?: unknown });
  const r = await createTeam(c.env.DB, c.get("userId"), b.name, b.kind, Date.now());
  if (!r.ok) return c.json({ error: r.reason }, r.reason === "not_verified" ? 403 : 400);
  return c.json({ id: r.id, code: r.code });
});

game2Routes.post("/teams/join", auth, async (c) => {
  const b = await c.req.json<{ code?: unknown }>().catch(() => ({}) as { code?: unknown });
  const r = await joinTeam(c.env.DB, c.get("userId"), b.code, Date.now());
  if (!r.ok) return c.json({ error: r.reason }, r.reason === "not_found" ? 404 : 409);
  return c.json({ id: r.id });
});

game2Routes.get("/teams/:id", auth, async (c) => {
  const t = await teamDetail(c.env.DB, c.req.param("id"), c.get("userId"));
  return t ? c.json(t) : c.json({ error: "not_found" }, 404);
});

// ---- city battles and seasons ---------------------------------------------------------------------------------------
game2Routes.get("/cities/battle", auth, async (c) => c.json(await cityBattle(c.env.DB, Date.now())));

game2Routes.get("/season", auth, async (c) => {
  const uid = c.get("userId");
  const now = Date.now();
  await applySeasonCorrection(c.env.DB, uid, now);
  return c.json({ season: seasonFor(now), events: activeEvents(now), history: await seasonHistory(c.env.DB, uid) });
});

// ---- owner analytics (x-admin-token, same secret as /api/admin) ------------------------------------------
game2Routes.get("/admin/duel-stats", async (c) => {
  const secret = c.env.ADMIN_TOKEN;
  if (!secret || !safeEqual(c.req.header("x-admin-token") ?? "", secret)) return c.json({ error: "unauthorized" }, 401);
  return c.json(await duelStats(c.env.DB, Date.now()));
});

// ---- profile --------------------------------------------------------------------------------------------------------
game2Routes.get("/profile/me", auth, async (c) => {
  const uid = c.get("userId");
  const xp = await balanceOf(c.env.DB, uid, "xp");
  const qizil = await balanceOf(c.env.DB, uid, "qizil");
  const rating = await c.env.DB.prepare("SELECT rating, peak FROM ratings WHERE user_id = ?").bind(uid).first<{ rating: number; peak: number }>();
  const r = rating?.rating ?? RATING.start;
  const stats = await statsOf(c.env.DB, uid);
  const ach = await listAchievements(c.env.DB, uid);
  const { level, into, need } = levelForXp(xp);
  return c.json({
    level,
    xp: { total: xp, into, need, perMatch: ECONOMY.match.xpPlayed },
    qizil,
    rating: { value: r, peak: rating?.peak ?? r, league: leagueOf(r), leagues: LEAGUES.map((l) => ({ id: l.id, min: l.min })) },
    stats,
    equipped: await equippedOf(c.env.DB, uid),
    achievements: { unlocked: ach.filter((a) => a.unlocked).length, total: ach.length },
  });
});
