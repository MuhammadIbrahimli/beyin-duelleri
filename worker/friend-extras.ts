// Friend extras: a short history of the head-to-head matches, safe reactions from a fixed list, and team invitations.
import { FRIEND_REACTIONS, type FriendReaction } from "../config/streak";
import { TEAM_MAX_MEMBERS } from "./teams";

export async function areFriends(db: D1Database, a: string, b: string): Promise<boolean> {
  const row = await db.prepare("SELECT 1 AS x FROM friends WHERE user_id = ? AND friend_id = ?").bind(a, b).first();
  return !!row;
}

/** The last matches between two players (real matches only, no bots, no training). */
export async function headToHead(db: D1Database, uid: string, friendId: string) {
  const rows = await db
    .prepare(
      "SELECT id, mode, winner, user0, points0, points1, created_at FROM matches " +
        "WHERE mode != 'training' AND ((user0 = ? AND user1 = ?) OR (user0 = ? AND user1 = ?)) ORDER BY created_at DESC LIMIT 10",
    )
    .bind(uid, friendId, friendId, uid)
    .all<{ id: string; mode: string; winner: number; user0: string; points0: number; points1: number; created_at: number }>();
  return rows.results.map((m) => {
    const mine = m.user0 === uid ? 0 : 1;
    return {
      id: m.id,
      mode: m.mode,
      won: m.winner === mine,
      draw: m.winner === -1,
      points: [mine === 0 ? m.points0 : m.points1, mine === 0 ? m.points1 : m.points0],
      createdAt: m.created_at,
    };
  });
}

export type ReactResult = { ok: true } | { ok: false; reason: "not_friend" | "bad_reaction" };

export async function react(db: D1Database, uid: string, friendId: string, reaction: unknown, now: number): Promise<ReactResult> {
  if (!(FRIEND_REACTIONS as readonly string[]).includes(String(reaction))) return { ok: false, reason: "bad_reaction" };
  if (!(await areFriends(db, uid, friendId))) return { ok: false, reason: "not_friend" };
  await db.prepare("INSERT INTO friend_reactions (id, from_id, to_id, reaction, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), uid, friendId, reaction as FriendReaction, now)
    .run();
  return { ok: true };
}

export async function reactionsReceived(db: D1Database, uid: string, since: number) {
  const rows = await db
    .prepare(
      "SELECT r.id, r.reaction, r.created_at, u.nickname AS from_nick FROM friend_reactions r JOIN users u ON u.id = r.from_id " +
        "WHERE r.to_id = ? AND r.created_at > ? ORDER BY r.created_at DESC LIMIT 20",
    )
    .bind(uid, since)
    .all<{ id: string; reaction: string; created_at: number; from_nick: string }>();
  return rows.results.map((r) => ({ id: r.id, reaction: r.reaction, from: r.from_nick, createdAt: r.created_at }));
}

export type InviteResult = { ok: true; id: string } | { ok: false; reason: "not_member" | "not_friend" | "already" | "full" };

/** A friend is invited into a team the inviter is in. The friend accepts or declines. */
export async function inviteToTeam(db: D1Database, uid: string, friendId: string, teamId: string, now: number): Promise<InviteResult> {
  const member = await db.prepare("SELECT 1 AS x FROM team_members WHERE team_id = ? AND user_id = ?").bind(teamId, uid).first();
  if (!member) return { ok: false, reason: "not_member" };
  if (!(await areFriends(db, uid, friendId))) return { ok: false, reason: "not_friend" };
  const already = await db.prepare("SELECT 1 AS x FROM team_members WHERE team_id = ? AND user_id = ?").bind(teamId, friendId).first();
  if (already) return { ok: false, reason: "already" };
  const n = await db.prepare("SELECT COUNT(*) AS n FROM team_members WHERE team_id = ?").bind(teamId).first<{ n: number }>();
  if ((n?.n ?? 0) >= TEAM_MAX_MEMBERS) return { ok: false, reason: "full" };
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO team_invites (id, team_id, from_id, to_id, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)")
    .bind(id, teamId, uid, friendId, now)
    .run();
  return { ok: true, id };
}

export async function myTeamInvites(db: D1Database, uid: string) {
  const rows = await db
    .prepare(
      "SELECT i.id, i.team_id, t.name AS team, u.nickname AS from_nick, i.created_at FROM team_invites i " +
        "JOIN teams t ON t.id = i.team_id JOIN users u ON u.id = i.from_id WHERE i.to_id = ? AND i.status = 'open' ORDER BY i.created_at DESC LIMIT 20",
    )
    .bind(uid)
    .all<{ id: string; team_id: string; team: string; from_nick: string; created_at: number }>();
  return rows.results.map((r) => ({ id: r.id, teamId: r.team_id, team: r.team, from: r.from_nick, createdAt: r.created_at }));
}

export async function respondInvite(db: D1Database, uid: string, inviteId: string, accept: boolean, now: number): Promise<{ ok: boolean; teamId?: string }> {
  const inv = await db.prepare("SELECT id, team_id FROM team_invites WHERE id = ? AND to_id = ? AND status = 'open'").bind(inviteId, uid).first<{ id: string; team_id: string }>();
  if (!inv) return { ok: false };
  const claim = await db.prepare("UPDATE team_invites SET status = ? WHERE id = ? AND status = 'open'").bind(accept ? "accepted" : "declined", inviteId).run();
  if ((claim.meta.changes ?? 0) !== 1) return { ok: false };
  if (accept) await db.prepare("INSERT OR IGNORE INTO team_members (team_id, user_id, joined_at) VALUES (?, ?, ?)").bind(inv.team_id, uid, now).run();
  return { ok: true, teamId: inv.team_id };
}
