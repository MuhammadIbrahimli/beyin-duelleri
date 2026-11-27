// Teams: groups of friends, classes, colleagues, faculties and universities. Joined by a code (no invite spam).
// A university team is refused until its name is on the verified list (config/universities.ts): nothing is invented.
// A team ranks by the average rating of its members, and only with enough members (so one player is not a team).
import { UNIVERSITIES } from "../config/universities";
import { newDuelCode } from "./util";

export const TEAM_KINDS = ["university", "faculty", "group", "class", "friends", "colleagues"] as const;
export type TeamKind = (typeof TEAM_KINDS)[number];
export const TEAM_MAX_MEMBERS = 50;
export const TEAM_MIN_FOR_RANKING = 3;

export type CreateTeam =
  | { ok: true; id: string; code: string }
  | { ok: false; reason: "bad_name" | "bad_kind" | "not_verified" | "limit" };

export async function createTeam(db: D1Database, uid: string, nameRaw: unknown, kind: unknown, now: number): Promise<CreateTeam> {
  const name = String(nameRaw ?? "").trim();
  if (name.length < 2 || name.length > 80) return { ok: false, reason: "bad_name" };
  if (!(TEAM_KINDS as readonly string[]).includes(String(kind))) return { ok: false, reason: "bad_kind" };
  if (kind === "university") {
    // a university name must match the verified list; with an empty list nothing can be created
    const known = UNIVERSITIES.some((u) => u.name.toLowerCase() === name.toLowerCase());
    if (!known) return { ok: false, reason: "not_verified" };
  }
  const mine = await db.prepare("SELECT COUNT(*) AS n FROM teams WHERE owner_id = ?").bind(uid).first<{ n: number }>();
  if ((mine?.n ?? 0) >= 5) return { ok: false, reason: "limit" };
  const id = crypto.randomUUID();
  let code = "";
  for (let i = 0; i < 5; i++) {
    code = newDuelCode(6).toUpperCase();
    const ins = await db
      .prepare("INSERT OR IGNORE INTO teams (id, name, kind, code, owner_id, verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, name, kind, code, uid, kind === "university" ? 1 : 0, now)
      .run();
    if ((ins.meta.changes ?? 0) === 1) {
      await db.prepare("INSERT INTO team_members (team_id, user_id, joined_at) VALUES (?, ?, ?)").bind(id, uid, now).run();
      return { ok: true, id, code };
    }
  }
  return { ok: false, reason: "limit" };
}

export type JoinTeam = { ok: true; id: string } | { ok: false; reason: "not_found" | "full" };

export async function joinTeam(db: D1Database, uid: string, codeRaw: unknown, now: number): Promise<JoinTeam> {
  const code = String(codeRaw ?? "").trim().toUpperCase();
  const team = await db.prepare("SELECT id FROM teams WHERE code = ?").bind(code).first<{ id: string }>();
  if (!team) return { ok: false, reason: "not_found" };
  const n = await db.prepare("SELECT COUNT(*) AS n FROM team_members WHERE team_id = ?").bind(team.id).first<{ n: number }>();
  if ((n?.n ?? 0) >= TEAM_MAX_MEMBERS) return { ok: false, reason: "full" };
  await db.prepare("INSERT OR IGNORE INTO team_members (team_id, user_id, joined_at) VALUES (?, ?, ?)").bind(team.id, uid, now).run();
  return { ok: true, id: team.id };
}

export async function myTeams(db: D1Database, uid: string) {
  const rows = await db
    .prepare(
      "SELECT t.id, t.name, t.kind, t.code, t.verified, t.owner_id, " +
        "(SELECT COUNT(*) FROM team_members m WHERE m.team_id = t.id) AS members " +
        "FROM teams t JOIN team_members x ON x.team_id = t.id WHERE x.user_id = ? ORDER BY t.name",
    )
    .bind(uid)
    .all<{ id: string; name: string; kind: string; code: string; verified: number; owner_id: string; members: number }>();
  return rows.results.map((t) => ({ ...t, verified: !!t.verified, owner: t.owner_id === uid }));
}

/** Team ranking: the average rating of the members, only for teams with enough members. */
export async function teamRanking(db: D1Database, page: number, pageSize: number) {
  const rows = await db
    .prepare(
      "SELECT t.id, t.name, t.kind, t.verified, COUNT(m.user_id) AS members, ROUND(AVG(COALESCE(r.rating, 300))) AS avg_rating " +
        "FROM teams t JOIN team_members m ON m.team_id = t.id LEFT JOIN ratings r ON r.user_id = m.user_id " +
        "GROUP BY t.id HAVING COUNT(m.user_id) >= ? ORDER BY avg_rating DESC, t.id LIMIT ? OFFSET ?",
    )
    .bind(TEAM_MIN_FOR_RANKING, pageSize, (page - 1) * pageSize)
    .all<{ id: string; name: string; kind: string; verified: number; members: number; avg_rating: number }>();
  return rows.results.map((r, i) => ({
    rank: (page - 1) * pageSize + i + 1,
    id: r.id,
    name: r.name,
    kind: r.kind,
    verified: !!r.verified,
    members: r.members,
    avgRating: r.avg_rating,
  }));
}

export async function teamDetail(db: D1Database, teamId: string, uid: string) {
  const team = await db
    .prepare("SELECT id, name, kind, verified, owner_id FROM teams t WHERE id = ? AND EXISTS (SELECT 1 FROM team_members WHERE team_id = t.id AND user_id = ?)")
    .bind(teamId, uid)
    .first<{ id: string; name: string; kind: string; verified: number; owner_id: string }>();
  if (!team) return null;
  const members = await db
    .prepare("SELECT u.id, u.nickname AS nick, COALESCE(r.rating, 300) AS rating FROM team_members m JOIN users u ON u.id = m.user_id LEFT JOIN ratings r ON r.user_id = u.id WHERE m.team_id = ? ORDER BY rating DESC")
    .bind(teamId)
    .all<{ id: string; nick: string; rating: number }>();
  const n = members.results.length;
  const avg = n ? Math.round(members.results.reduce((s, m) => s + m.rating, 0) / n) : 0;
  return {
    id: team.id,
    name: team.name,
    kind: team.kind,
    verified: !!team.verified,
    ranked: n >= TEAM_MIN_FOR_RANKING,
    avgRating: avg,
    members: members.results.map((m) => ({ id: m.id, nick: m.nick, rating: m.rating })),
  };
}
