import { Hono } from "hono";
import { EXPERIMENTS } from "../../shared/experiments";
import { validateName } from "../../shared/profile";
import type { AppEnv } from "../env";
import { auth } from "../middleware/auth";
import { newDuelCode } from "../util";

export const GROUP_MAX_MEMBERS = 50;
const MAX_OWNED = 5;
const MAX_JOINED = 20;

/** Persistent groups: a class, friends or a team share one code and a standing Beyin balı leaderboard. */
export const groupRoutes = new Hono<AppEnv>();
groupRoutes.use("/groups*", auth);

const count = async (db: D1Database, sql: string, ...a: unknown[]) => (await db.prepare(sql).bind(...a).first<{ n: number }>())?.n ?? 0;
const codeOf = () => newDuelCode(6).toUpperCase();
const norm = (c: string) => c.trim().toUpperCase();

groupRoutes.post("/groups", async (c) => {
  const me = c.get("userId");
  const db = c.env.DB;
  const b = await c.req.json<{ name?: string }>().catch(() => ({}) as any);
  const n = validateName(b.name);
  if (!n.ok || n.value.length > 24) return c.json({ error: "bad_name" }, 400);
  if ((await count(db, "SELECT COUNT(*) AS n FROM groups WHERE owner_id = ?", me)) >= MAX_OWNED) return c.json({ error: "too_many_groups" }, 409);
  const id = crypto.randomUUID();
  const code = codeOf();
  const now = Date.now();
  await db.batch([
    db.prepare("INSERT INTO groups (id, code, name, owner_id, created_at) VALUES (?,?,?,?,?)").bind(id, code, n.value, me, now),
    db.prepare("INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?,?,?)").bind(id, me, now),
  ]);
  return c.json({ code, name: n.value, url: `${c.env.SITE_ORIGIN || new URL(c.req.url).origin}/g/${code}` }, 201);
});

groupRoutes.post("/groups/join", async (c) => {
  const me = c.get("userId");
  const db = c.env.DB;
  const b = await c.req.json<{ code?: string }>().catch(() => ({}) as any);
  const g = await db.prepare("SELECT id, code, name FROM groups WHERE code = ?").bind(norm(String(b.code ?? ""))).first<any>();
  if (!g) return c.json({ error: "not_found" }, 404);
  const already = await count(db, "SELECT COUNT(*) AS n FROM group_members WHERE group_id = ? AND user_id = ?", g.id, me);
  if (!already) {
    if ((await count(db, "SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?", g.id)) >= GROUP_MAX_MEMBERS) return c.json({ error: "full" }, 409);
    if ((await count(db, "SELECT COUNT(*) AS n FROM group_members WHERE user_id = ?", me)) >= MAX_JOINED) return c.json({ error: "too_many_groups" }, 409);
    await db.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id, joined_at) VALUES (?,?,?)").bind(g.id, me, Date.now()).run();
  }
  return c.json({ code: g.code, name: g.name });
});

groupRoutes.get("/groups", async (c) => {
  const me = c.get("userId");
  const { results } = await c.env.DB.prepare(
    `SELECT g.code, g.name, g.owner_id AS owner,
       (SELECT COUNT(*) FROM group_members x WHERE x.group_id = g.id) AS members,
       (SELECT COUNT(*) FROM group_members x JOIN user_scores s ON s.user_id = x.user_id
          WHERE x.group_id = g.id AND s.score > COALESCE((SELECT score FROM user_scores WHERE user_id = ?), 0)) + 1 AS rank
     FROM group_members m JOIN groups g ON g.id = m.group_id WHERE m.user_id = ? ORDER BY m.joined_at DESC`,
  ).bind(me, me).all<any>();
  return c.json({ groups: results.map((g) => ({ code: g.code, name: g.name, members: g.members, rank: g.rank, isOwner: g.owner === me })) });
});

groupRoutes.get("/groups/:code", async (c) => {
  const me = c.get("userId");
  const db = c.env.DB;
  const g = await db.prepare("SELECT id, code, name, owner_id AS owner FROM groups WHERE code = ?").bind(norm(c.req.param("code"))).first<any>();
  if (!g) return c.json({ error: "not_found" }, 404);
  const members = await count(db, "SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?", g.id);
  const isMember = (await count(db, "SELECT COUNT(*) AS n FROM group_members WHERE group_id = ? AND user_id = ?", g.id, me)) > 0;
  // non-members only see the name and size, so the invite page can offer "join"
  if (!isMember) return c.json({ error: "not_member", name: g.name, members }, 403);
  const { results } = await db.prepare(
    `SELECT u.id, u.nickname, u.city_code AS city, COALESCE(s.score, 0) AS score, COALESCE(s.played, 0) AS played
     FROM group_members m JOIN users u ON u.id = m.user_id LEFT JOIN user_scores s ON s.user_id = u.id
     WHERE m.group_id = ? ORDER BY score DESC, played DESC, m.joined_at ASC`,
  ).bind(g.id).all<any>();
  return c.json({
    code: g.code, name: g.name, total: EXPERIMENTS.length, isOwner: g.owner === me,
    members: results.map((m, i) => ({ rank: i + 1, nickname: m.nickname, city: m.city, score: m.score, played: m.played, isMe: m.id === me })),
  });
});

groupRoutes.delete("/groups/:code/leave", async (c) => {
  const me = c.get("userId");
  const db = c.env.DB;
  const g = await db.prepare("SELECT id, owner_id AS owner FROM groups WHERE code = ?").bind(norm(c.req.param("code"))).first<any>();
  if (!g) return c.json({ error: "not_found" }, 404);
  await db.prepare("DELETE FROM group_members WHERE group_id = ? AND user_id = ?").bind(g.id, me).run();
  const left = await count(db, "SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?", g.id);
  if (left === 0) await db.prepare("DELETE FROM groups WHERE id = ?").bind(g.id).run();
  else if (g.owner === me) {
    const next = await db.prepare("SELECT user_id FROM group_members WHERE group_id = ? ORDER BY joined_at ASC LIMIT 1").bind(g.id).first<{ user_id: string }>();
    if (next) await db.prepare("UPDATE groups SET owner_id = ? WHERE id = ?").bind(next.user_id, g.id).run();
  }
  return c.json({ ok: true });
});
