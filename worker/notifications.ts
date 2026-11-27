// In-app notifications: incoming challenges and team invitations, results of my asynchronous duels, and reactions.
// Nothing is pushed or polled: the client asks once when the home screen opens (`since` is its last check).
import { incomingChallenges } from "./social";
import { myTeamInvites, reactionsReceived } from "./friend-extras";

export async function notificationsFor(db: D1Database, uid: string, since: number, now: number) {
  const [challenges, invites, reactions, results] = await Promise.all([
    incomingChallenges(db, uid, now),
    myTeamInvites(db, uid),
    reactionsReceived(db, uid, since),
    db.prepare(
      "SELECT d.code AS code, u.nickname AS who, r.finished_at AS at FROM duels d " +
        "JOIN runs cr ON cr.id = d.creator_run_id " +
        "JOIN duel_entries e ON e.duel_id = d.id " +
        "JOIN runs r ON r.id = e.run_id " +
        "JOIN users u ON u.id = r.user_id " +
        "WHERE cr.user_id = ? AND r.user_id <> ? AND r.finished_at IS NOT NULL AND r.finished_at > ? " +
        "ORDER BY r.finished_at DESC LIMIT 20",
    ).bind(uid, uid, since).all<{ code: string; who: string; at: number }>(),
  ]);
  return {
    checkedAt: now,
    challenges,
    teamInvites: invites,
    reactions,
    duelResults: results.results.map((r) => ({ code: r.code, who: r.who, at: r.at })),
  };
}
