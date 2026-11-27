// Friends: a short personal code, a two-way friendship, head-to-head results, and challenges to a friend's room.
// A challenge is a friendly (unrated) room that only the two players may enter. No open chat.
import type { Env } from "./env";
import { createMatchRoom } from "./match-rooms";
import { checkAchievements } from "./achievements";
import { newDuelCode } from "./util";

export async function myCode(db: D1Database, uid: string, now: number): Promise<string> {
  const row = await db.prepare("SELECT code FROM friend_codes WHERE user_id = ?").bind(uid).first<{ code: string }>();
  if (row) return row.code;
  for (let i = 0; i < 5; i++) {
    const code = newDuelCode(8).toUpperCase();
    const ins = await db
      .prepare("INSERT OR IGNORE INTO friend_codes (user_id, code, created_at) VALUES (?, ?, ?)")
      .bind(uid, code, now)
      .run();
    if ((ins.meta.changes ?? 0) === 1) return code;
  }
  throw new Error("could not make a friend code");
}

export type AddResult = { ok: true; friendId: string } | { ok: false; reason: "not_found" | "self" };

export async function addFriend(db: D1Database, uid: string, codeRaw: string, now: number): Promise<AddResult> {
  const code = String(codeRaw ?? "").trim().toUpperCase();
  const row = await db.prepare("SELECT user_id FROM friend_codes WHERE code = ?").bind(code).first<{ user_id: string }>();
  if (!row) return { ok: false, reason: "not_found" };
  if (row.user_id === uid) return { ok: false, reason: "self" };
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)").bind(uid, row.user_id, now),
    db.prepare("INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)").bind(row.user_id, uid, now),
  ]);
  await checkAchievements(db, uid, now);
  await checkAchievements(db, row.user_id, now);
  return { ok: true, friendId: row.user_id };
}

export interface FriendView {
  id: string;
  nick: string;
  rating: number | null;
  /** online only when the friend allows it and was seen in the last 5 minutes */
  online: boolean;
  wins: number;      // my wins against this friend
  losses: number;
  draws: number;
}

export async function listFriends(db: D1Database, uid: string, now = Date.now()): Promise<FriendView[]> {
  const rows = await db
    .prepare(
      "SELECT f.friend_id AS id, u.nickname AS nick, r.rating AS rating, u.last_seen_at AS seen, u.show_presence AS show FROM friends f " +
        "JOIN users u ON u.id = f.friend_id LEFT JOIN ratings r ON r.user_id = f.friend_id WHERE f.user_id = ? ORDER BY u.nickname",
    )
    .bind(uid)
    .all<{ id: string; nick: string; rating: number | null; seen: number; show: number }>();
  const out: FriendView[] = [];
  for (const f of rows.results) {
    // head-to-head: only real matches between the two of us (no bots, no training)
    const h = await db
      .prepare(
        "SELECT " +
          "SUM(CASE WHEN (user0 = ? AND winner = 0) OR (user1 = ? AND winner = 1) THEN 1 ELSE 0 END) AS wins, " +
          "SUM(CASE WHEN (user0 = ? AND winner = 1) OR (user1 = ? AND winner = 0) THEN 1 ELSE 0 END) AS losses, " +
          "SUM(CASE WHEN winner = -1 THEN 1 ELSE 0 END) AS draws " +
          "FROM matches WHERE mode != 'training' AND ((user0 = ? AND user1 = ?) OR (user0 = ? AND user1 = ?))",
      )
      .bind(uid, uid, uid, uid, uid, f.id, f.id, uid)
      .first<{ wins: number | null; losses: number | null; draws: number | null }>();
    const online = !!f.show && now - f.seen < 5 * 60 * 1000;
    out.push({ id: f.id, nick: f.nick, rating: f.rating, online, wins: h?.wins ?? 0, losses: h?.losses ?? 0, draws: h?.draws ?? 0 });
  }
  return out;
}

export type ChallengeResult = { ok: true; code: string } | { ok: false; reason: "not_friend" | "server_error" };

/** A friend's room: friendly, unrated, and only these two can take the seats. */
export async function challenge(env: Env, uid: string, friendId: string, now: number): Promise<ChallengeResult> {
  const f = await env.DB.prepare("SELECT 1 AS x FROM friends WHERE user_id = ? AND friend_id = ?").bind(uid, friendId).first();
  if (!f) return { ok: false, reason: "not_friend" };
  const code = await createMatchRoom(env, { mode: "friendly", expect: [uid, friendId], bot: null });
  if (!code) return { ok: false, reason: "server_error" };
  await env.DB.prepare("INSERT INTO challenges (id, from_id, to_id, room_code, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)")
    .bind(crypto.randomUUID(), uid, friendId, code, now)
    .run();
  return { ok: true, code };
}

/** Open challenges sent to me in the last hour. */
export async function incomingChallenges(db: D1Database, uid: string, now: number) {
  const rows = await db
    .prepare(
      "SELECT c.id, c.room_code, c.created_at, u.nickname AS from_nick FROM challenges c JOIN users u ON u.id = c.from_id " +
        "WHERE c.to_id = ? AND c.status = 'open' AND c.created_at >= ? ORDER BY c.created_at DESC LIMIT 10",
    )
    .bind(uid, now - 60 * 60 * 1000)
    .all<{ id: string; room_code: string; created_at: number; from_nick: string }>();
  return rows.results.map((r) => ({ id: r.id, code: r.room_code, from: r.from_nick, createdAt: r.created_at }));
}
