// Team challenges: one team invites another for a Baku week. The result is counted from real matches between a member
// of one team and a member of the other (no bots, no training). Only the owner of the challenged team can accept.
import { weekStart } from "./calendar";

const WEEK = 7 * 24 * 60 * 60 * 1000;

export type ChallengeResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_owner" | "same_team" | "not_found" | "team_full_or_limit" };

export async function createChallenge(db: D1Database, uid: string, fromTeam: string, toTeamCode: string, now: number): Promise<ChallengeResult> {
  const from = await db.prepare("SELECT id, owner_id FROM teams WHERE id = ?").bind(fromTeam).first<{ id: string; owner_id: string }>();
  if (!from) return { ok: false, reason: "not_found" };
  if (from.owner_id !== uid) return { ok: false, reason: "not_owner" };
  const to = await db.prepare("SELECT id FROM teams WHERE code = ?").bind(toTeamCode.trim().toUpperCase()).first<{ id: string }>();
  if (!to) return { ok: false, reason: "not_found" };
  if (to.id === from.id) return { ok: false, reason: "same_team" };
  const open = await db
    .prepare("SELECT COUNT(*) AS n FROM team_challenges WHERE from_team = ? AND week_start = ? AND status != 'declined'")
    .bind(from.id, weekStart(now))
    .first<{ n: number }>();
  if ((open?.n ?? 0) >= 2) return { ok: false, reason: "team_full_or_limit" };
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO team_challenges (id, from_team, to_team, week_start, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)")
    .bind(id, from.id, to.id, weekStart(now), now)
    .run();
  return { ok: true, id };
}

export async function respondChallenge(db: D1Database, uid: string, id: string, accept: boolean, now: number): Promise<{ ok: boolean; reason?: string }> {
  const c = await db
    .prepare("SELECT c.id, c.to_team, c.week_start, t.owner_id FROM team_challenges c JOIN teams t ON t.id = c.to_team WHERE c.id = ? AND c.status = 'open'")
    .bind(id)
    .first<{ id: string; to_team: string; week_start: number; owner_id: string }>();
  if (!c) return { ok: false, reason: "not_found" };
  if (c.owner_id !== uid) return { ok: false, reason: "not_owner" };
  if (accept && now >= c.week_start + WEEK) return { ok: false, reason: "week_over" };
  await db.prepare("UPDATE team_challenges SET status = ? WHERE id = ? AND status = 'open'").bind(accept ? "accepted" : "declined", id).run();
  return { ok: true };
}

async function members(db: D1Database, teamId: string): Promise<Set<string>> {
  const rows = await db.prepare("SELECT user_id FROM team_members WHERE team_id = ?").bind(teamId).all<{ user_id: string }>();
  return new Set(rows.results.map((r) => r.user_id));
}

/** Live (or final) score of an accepted challenge: matches between the two teams' members in the challenge week. */
export async function scoreOf(db: D1Database, challengeId: string, now: number) {
  const c = await db
    .prepare("SELECT c.id, c.from_team, c.to_team, c.week_start, c.status, c.created_at, f.name AS from_name, t.name AS to_name " +
      "FROM team_challenges c JOIN teams f ON f.id = c.from_team JOIN teams t ON t.id = c.to_team WHERE c.id = ?")
    .bind(challengeId)
    .first<{ id: string; from_team: string; to_team: string; week_start: number; status: string; created_at: number; from_name: string; to_name: string }>();
  if (!c) return null;
  const base = { id: c.id, status: c.status, weekStart: c.week_start, endsAt: c.week_start + WEEK, from: { id: c.from_team, name: c.from_name, wins: 0 }, to: { id: c.to_team, name: c.to_name, wins: 0 }, matches: 0, leader: null as string | null, over: now >= c.week_start + WEEK };
  if (c.status !== "accepted") return base;
  const A = await members(db, c.from_team);
  const B = await members(db, c.to_team);
  const rows = await db
    .prepare("SELECT user0, user1, winner FROM matches WHERE mode != 'training' AND user0 IS NOT NULL AND user1 IS NOT NULL AND created_at >= ? AND created_at < ? LIMIT 5000")
    .bind(c.week_start, c.week_start + WEEK)
    .all<{ user0: string; user1: string; winner: number }>();
  for (const m of rows.results) {
    const aVsB = A.has(m.user0) && B.has(m.user1);
    const bVsA = B.has(m.user0) && A.has(m.user1);
    if (!aVsB && !bVsA) continue;
    base.matches++;
    if (m.winner === -1) continue;
    const winnerSeatUser = m.winner === 0 ? m.user0 : m.user1;
    if (A.has(winnerSeatUser)) base.from.wins++;
    else if (B.has(winnerSeatUser)) base.to.wins++;
  }
  base.leader = base.from.wins === base.to.wins ? "draw" : base.from.wins > base.to.wins ? c.from_team : c.to_team;
  return base;
}

/** Challenges that involve teams I own or belong to, newest first, with their scores. */
export async function myChallenges(db: D1Database, uid: string, now: number) {
  const rows = await db
    .prepare("SELECT DISTINCT c.id FROM team_challenges c JOIN team_members m ON (m.team_id = c.from_team OR m.team_id = c.to_team) " +
      "WHERE m.user_id = ? ORDER BY c.created_at DESC LIMIT 30")
    .bind(uid)
    .all<{ id: string }>();
  const out = [];
  for (const r of rows.results) out.push(await scoreOf(db, r.id, now));
  return out.filter(Boolean);
}
