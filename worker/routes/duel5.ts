// API for the multi-discipline match: the matchmaking socket, training and friend matches, and the player's
// rating, XP, Qızıl and match history. Everything a result depends on is computed on the server.
import { Hono } from "hono";
import { BOT_LEVEL_IDS, type BotLevel } from "../../config/match";
import { ECONOMY, levelForXp } from "../../config/economy";
import { LEAGUES, RATING } from "../../config/rating";
import type { AppEnv } from "../env";
import { auth } from "../middleware/auth";
import { balanceOf } from "../economy-core";
import { createMatchRoom } from "../match-rooms";
import { leagueOf } from "../rating-core";
import { applySeasonCorrection } from "../seasons";

export const duel5Routes = new Hono<AppEnv>();

const PAGE = 20;

/** The shared matchmaking queue: one WebSocket per searching player. */
duel5Routes.get("/mm/ws", async (c) => {
  if (c.req.header("upgrade")?.toLowerCase() !== "websocket") return c.json({ error: "expected_websocket" }, 426);
  if (!c.env.QUEUE) return c.json({ error: "queue_unavailable" }, 503);
  return c.env.QUEUE.get(c.env.QUEUE.idFromName("global")).fetch(c.req.raw);
});

/** A training match against a bot. It is always labelled as a bot and never changes the rating. */
duel5Routes.post("/matches/training", auth, async (c) => {
  if (!c.env.ROOMS) return c.json({ error: "rooms_unavailable" }, 503);
  const b = await c.req.json<{ level?: unknown }>().catch(() => ({}) as { level?: unknown });
  const level = (BOT_LEVEL_IDS as string[]).includes(String(b.level)) ? (b.level as BotLevel) : null;
  if (!level) return c.json({ error: "bad_level" }, 400);
  const code = await createMatchRoom(c.env, { mode: "training", expect: [c.get("userId")], bot: level });
  if (!code) return c.json({ error: "server_error" }, 500);
  return c.json({ code, mode: "training", level });
});

/** A match with a friend: the code is shared like an invite link. It is unrated. */
duel5Routes.post("/matches/friend", auth, async (c) => {
  if (!c.env.ROOMS) return c.json({ error: "rooms_unavailable" }, 503);
  const code = await createMatchRoom(c.env, { mode: "friendly", expect: null, bot: null });
  if (!code) return c.json({ error: "server_error" }, 500);
  return c.json({ code, mode: "friendly" });
});

/** The player's rating, league, best rank and the last rating changes. */
duel5Routes.get("/ratings/me", auth, async (c) => {
  const uid = c.get("userId");
  await applySeasonCorrection(c.env.DB, uid, Date.now());
  const row = await c.env.DB.prepare(
    "SELECT rating, peak, played, wins, losses, draws, streak, best_streak FROM ratings WHERE user_id = ?",
  )
    .bind(uid)
    .first<{ rating: number; peak: number; played: number; wins: number; losses: number; draws: number; streak: number; best_streak: number }>();
  const rating = row?.rating ?? RATING.start;
  const history = await c.env.DB.prepare(
    "SELECT match_id, rating_before, rating_after, delta, created_at FROM rating_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 10",
  )
    .bind(uid)
    .all();
  const played = row?.played ?? 0;
  const wins = row?.wins ?? 0;
  return c.json({
    rating,
    peak: row?.peak ?? rating,
    league: leagueOf(rating),
    leagues: LEAGUES.map((l) => ({ id: l.id, min: l.min })),
    played,
    wins,
    losses: row?.losses ?? 0,
    draws: row?.draws ?? 0,
    winRate: played ? Math.round((wins / played) * 1000) / 10 : 0,
    streak: row?.streak ?? 0,
    bestStreak: row?.best_streak ?? 0,
    history: history.results,
  });
});

/** Ranking of rated players, paginated. The player's own place is always returned, even outside the page. */
duel5Routes.get("/ratings/top", auth, async (c) => {
  const uid = c.get("userId");
  const page = Math.max(1, Math.floor(Number(c.req.query("page")) || 1));
  const total = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM ratings").first<{ n: number }>();
  const rows = await c.env.DB.prepare(
    "SELECT r.user_id, r.rating, u.nickname FROM ratings r JOIN users u ON u.id = r.user_id ORDER BY r.rating DESC, r.user_id LIMIT ? OFFSET ?",
  )
    .bind(PAGE, (page - 1) * PAGE)
    .all<{ user_id: string; rating: number; nickname: string }>();
  const mine = await c.env.DB.prepare("SELECT rating FROM ratings WHERE user_id = ?").bind(uid).first<{ rating: number }>();
  let me: { rank: number; rating: number; league: string } | null = null;
  if (mine) {
    const above = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM ratings WHERE rating > ?").bind(mine.rating).first<{ n: number }>();
    me = { rank: (above?.n ?? 0) + 1, rating: mine.rating, league: leagueOf(mine.rating) };
  }
  return c.json({
    page,
    pages: Math.max(1, Math.ceil((total?.n ?? 0) / PAGE)),
    rows: rows.results.map((r, i) => ({
      rank: (page - 1) * PAGE + i + 1,
      id: r.user_id === uid ? "me" : null,
      nick: r.nickname,
      rating: r.rating,
      league: leagueOf(r.rating),
    })),
    me,
  });
});

/** XP and level (account progress) and the Qızıl balance. Neither changes a match. */
duel5Routes.get("/economy/me", auth, async (c) => {
  const uid = c.get("userId");
  const xp = await balanceOf(c.env.DB, uid, "xp");
  const qizil = await balanceOf(c.env.DB, uid, "qizil");
  const { level, into, need } = levelForXp(xp);
  return c.json({ xp, level, into, need, qizil, matchesPerDay: ECONOMY.matchesPerDay });
});

/** The player's last matches, newest first. */
duel5Routes.get("/matches/mine", auth, async (c) => {
  const uid = c.get("userId");
  // XP and Qızıl each match gave this player, read from the ledger (refs look like match:CODE:SEAT:CURRENCY)
  const gains = await c.env.DB.prepare("SELECT ref, currency, delta FROM econ_ledger WHERE user_id = ? AND reason IN ('match', 'bot_match') ORDER BY id DESC LIMIT 200")
    .bind(uid)
    .all<{ ref: string; currency: string; delta: number }>();
  const byCode = new Map<string, { xp: number; qizil: number }>();
  for (const g of gains.results) {
    const code = g.ref.split(":")[1];
    const cur = byCode.get(code) ?? { xp: 0, qizil: 0 };
    if (g.currency === "xp") cur.xp += g.delta;
    else cur.qizil += g.delta;
    byCode.set(code, cur);
  }
  const rows = await c.env.DB.prepare(
    "SELECT id, mode, rated, winner, reason, user0, user1, bot0, bot1, points0, points1, delta0, delta1, created_at " +
      "FROM matches WHERE user0 = ? OR user1 = ? ORDER BY created_at DESC LIMIT 20",
  )
    .bind(uid, uid)
    .all<Record<string, unknown>>();
  return c.json({
    matches: rows.results.map((m) => {
      const seat = m.user0 === uid ? 0 : 1;
      const oppBot = seat === 0 ? m.bot1 : m.bot0;
      return {
        id: m.id,
        mode: m.mode,
        rated: !!m.rated,
        won: m.winner === seat,
        draw: m.winner === -1,
        points: [seat === 0 ? m.points0 : m.points1, seat === 0 ? m.points1 : m.points0],
        delta: seat === 0 ? m.delta0 : m.delta1,
        opponentBot: !!oppBot,
        createdAt: m.created_at,
        xp: byCode.get(String(m.id))?.xp ?? 0,
        qizil: byCode.get(String(m.id))?.qizil ?? 0,
      };
    }),
  });
});
