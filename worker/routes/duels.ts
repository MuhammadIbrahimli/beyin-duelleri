import { Hono } from "hono";
import { rankRuns, type DuelRun } from "../../shared/duel";
import { byId } from "../../shared/experiments";
import type { AppEnv } from "../env";
import { auth } from "../middleware/auth";
import { newDuelCode } from "../util";

const DUEL_TTL_MS = 7 * 86400000;
export const GROUP_MAX = 10;

type Row = {
  run_id: string;
  user_id: string;
  nickname: string;
  valid: number;
  primary_score: number;
  secondary_json: string;
  finished_at: number;
  level: number | null;
};

async function finishedEntries(db: D1Database, duelId: string): Promise<Row[]> {
  const { results } = await db
    .prepare(
      `SELECT e.run_id, r.user_id, u.nickname, r.valid, r.primary_score, r.secondary_json, r.finished_at, r.level
       FROM duel_entries e JOIN runs r ON r.id = e.run_id JOIN users u ON u.id = r.user_id
       WHERE e.duel_id = ? AND r.status = 'finished'`,
    )
    .bind(duelId)
    .all<Row>();
  return results;
}

const toDuelRun = (r: Row): DuelRun => ({
  valid: !!r.valid,
  primary: r.primary_score,
  secondary: JSON.parse(r.secondary_json ?? "{}"),
  finishedAt: r.finished_at,
});

/** Recompute ranks for every finished entry of a duel. */
export async function rankDuel(db: D1Database, duelId: string): Promise<void> {
  const duel = await db.prepare("SELECT experiment_id FROM duels WHERE id = ?").bind(duelId).first<{ experiment_id: number }>();
  if (!duel) return;
  const rows = await finishedEntries(db, duelId);
  const ranks = rankRuns(byId(duel.experiment_id)!, rows.map(toDuelRun));
  await db.batch(
    rows.map((r, i) =>
      db.prepare("UPDATE duel_entries SET rank = ? WHERE duel_id = ? AND run_id = ?").bind(ranks[i], duelId, r.run_id),
    ),
  );
}

export const duelRoutes = new Hono<AppEnv>();
duelRoutes.use("*", auth);

duelRoutes.post("/duels", async (c) => {
  const userId = c.get("userId");
  const db = c.env.DB;
  const b = await c.req.json<{ runId?: string; type?: string }>().catch(() => ({}) as any);
  const type = b.type === "group" ? "group" : "1v1";
  const run = await db
    .prepare("SELECT * FROM runs WHERE id = ? AND user_id = ?")
    .bind(String(b.runId), userId)
    .first<any>();
  if (!run || run.status !== "finished") return c.json({ error: "run_not_finished" }, 400);
  if (!run.valid) return c.json({ error: "run_invalid" }, 400);
  const id = crypto.randomUUID();
  const code = newDuelCode();
  const now = Date.now();
  await db.batch([
    db
      .prepare(
        "INSERT INTO duels (id, code, experiment_id, seed, creator_run_id, type, max_players, expires_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      )
      .bind(id, code, run.experiment_id, run.seed, run.id, type, type === "group" ? GROUP_MAX : 2, now + DUEL_TTL_MS, now),
    db.prepare("INSERT INTO duel_entries (duel_id, run_id, rank) VALUES (?,?,1)").bind(id, run.id),
  ]);
  return c.json({ code, url: `${c.env.SITE_ORIGIN}/d/${code}` }, 201);
});

/** Invite page data. Never contains the creator's result. */
duelRoutes.get("/duels/:code", async (c) => {
  const db = c.env.DB;
  const userId = c.get("userId");
  const d = await db
    .prepare(
      `SELECT d.*, u.nickname AS creator_nick, r.user_id AS creator_id FROM duels d
       JOIN runs r ON r.id = d.creator_run_id JOIN users u ON u.id = r.user_id WHERE d.code = ?`,
    )
    .bind(c.req.param("code"))
    .first<any>();
  if (!d) return c.json({ error: "not_found" }, 404);
  const { results } = await db
    .prepare("SELECT r.user_id FROM duel_entries e JOIN runs r ON r.id = e.run_id WHERE e.duel_id = ?")
    .bind(d.id)
    .all<{ user_id: string }>();
  const expired = d.expires_at < Date.now();
  const full = results.length >= d.max_players;
  return c.json({
    code: d.code,
    slug: byId(d.experiment_id)!.slug,
    type: d.type,
    maxPlayers: d.max_players,
    expiresAt: d.expires_at,
    players: results.length,
    creator: { nickname: d.creator_nick },
    status: expired ? "expired" : full ? "closed" : "open",
    isCreator: d.creator_id === userId,
    joined: results.some((e) => e.user_id === userId),
  });
});

/** Results are visible only to someone who has finished their own run in this duel. */
duelRoutes.get("/duels/:code/result", async (c) => {
  const db = c.env.DB;
  const userId = c.get("userId");
  const d = await db
    .prepare("SELECT id, code, experiment_id, type FROM duels WHERE code = ?")
    .bind(c.req.param("code"))
    .first<any>();
  if (!d) return c.json({ error: "not_found" }, 404);
  const rows = await finishedEntries(db, d.id);
  if (!rows.some((r) => r.user_id === userId)) return c.json({ error: "finish_first" }, 403);
  const ranks = rankRuns(byId(d.experiment_id)!, rows.map(toDuelRun));
  const entries = rows
    .map((r, i) => ({
      nickname: r.nickname,
      primary: r.primary_score,
      secondary: JSON.parse(r.secondary_json ?? "{}"),
      level: r.level,
      valid: !!r.valid,
      rank: ranks[i],
      isMe: r.user_id === userId,
    }))
    .sort((a, b) => a.rank - b.rank);
  const me = entries.find((e) => e.isMe)!;
  const other = entries.find((e) => !e.isMe);
  const outcome =
    d.type === "1v1" && other ? (me.rank < other.rank ? "win" : me.rank > other.rank ? "lose" : "tie") : null;
  return c.json({ code: d.code, slug: byId(d.experiment_id)!.slug, type: d.type, outcome, entries });
});
