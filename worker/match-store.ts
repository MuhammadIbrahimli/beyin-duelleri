// Stores a finished match once: the match row, the rating change of rated matches, and the rewards.
// Called by the room host when a match ends. A second call for the same match changes nothing.
import { ECONOMY } from "../config/economy";
import { RATING } from "../config/rating";
import { bakuDayStart, credit, gainedToday } from "./economy-core";
import { applyRated, scoreForSeat0, type Player } from "./rating-core";

export interface MatchResult {
  code: string;
  mode: "rated" | "friendly" | "training";
  rated: boolean;
  ids: [string | null, string | null];
  bots: [string | null, string | null];
  points: [number, number];
  winner: 0 | 1 | -1;
  reason: string;
  history: { id: string; winner: 0 | 1 | -1; score: [number, number] }[];
}

export async function storeMatch(db: D1Database, r: MatchResult, now: number): Promise<boolean> {
  const human: [string | null, string | null] = [r.ids[0] && !r.bots[0] ? r.ids[0] : null, r.ids[1] && !r.bots[1] ? r.ids[1] : null];
  const ins = await db
    .prepare(
      "INSERT INTO matches (id, mode, rated, winner, reason, user0, user1, bot0, bot1, points0, points1, history_json, created_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
    )
    .bind(
      r.code,
      r.mode,
      r.rated && human[0] && human[1] ? 1 : 0,
      r.winner,
      r.reason,
      human[0],
      human[1],
      r.bots[0],
      r.bots[1],
      r.points[0],
      r.points[1],
      JSON.stringify(r.history),
      now,
    )
    .run();
  if (!(ins.meta.changes ?? 0)) return false; // already stored

  if (r.rated && human[0] && human[1]) await rate(db, r, human[0], human[1], now);
  for (const seat of [0, 1] as const) {
    const uid = human[seat];
    if (uid) await reward(db, r, seat, uid, now);
  }
  return true;
}

async function rate(db: D1Database, r: MatchResult, a: string, b: string, now: number): Promise<void> {
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO ratings (user_id, rating, peak, updated_at) VALUES (?, ?, ?, ?)").bind(a, RATING.start, RATING.start, now),
    db.prepare("INSERT OR IGNORE INTO ratings (user_id, rating, peak, updated_at) VALUES (?, ?, ?, ?)").bind(b, RATING.start, RATING.start, now),
  ]);
  const rows = await db
    .prepare("SELECT user_id, rating, played, streak, wins, losses, draws, peak, best_streak FROM ratings WHERE user_id IN (?, ?)")
    .bind(a, b)
    .all<{ user_id: string; rating: number; played: number; streak: number; wins: number; losses: number; draws: number; peak: number; best_streak: number }>();
  const ra = rows.results.find((x) => x.user_id === a);
  const rb = rows.results.find((x) => x.user_id === b);
  if (!ra || !rb) return;
  // matches between the same two accounts in the repeat window (this match is already stored, so it is left out)
  const rep = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM matches WHERE rated = 1 AND id <> ? AND created_at >= ? " +
        "AND ((user0 = ? AND user1 = ?) OR (user0 = ? AND user1 = ?))",
    )
    .bind(r.code, now - RATING.repeatWindowMs, a, b, b, a)
    .first<{ n: number }>();
  const repeats = rep?.n ?? 0;
  const pa: Player = { rating: ra.rating, played: ra.played, streak: ra.streak };
  const pb: Player = { rating: rb.rating, played: rb.played, streak: rb.streak };
  const score = scoreForSeat0(r.winner);
  const res = applyRated(pa, pb, score, repeats);
  const outcomeA = score === 1 ? "w" : score === 0 ? "l" : "d";
  const outcomeB = score === 0 ? "w" : score === 1 ? "l" : "d";
  const stats = (row: typeof ra, p: Player, o: "w" | "l" | "d") => ({
    rating: p.rating,
    played: p.played,
    streak: p.streak,
    wins: row.wins + (o === "w" ? 1 : 0),
    losses: row.losses + (o === "l" ? 1 : 0),
    draws: row.draws + (o === "d" ? 1 : 0),
    peak: Math.max(row.peak, p.rating),
    bestStreak: Math.max(row.best_streak, p.streak),
  });
  const sa = stats(ra, res.a, outcomeA);
  const sb = stats(rb, res.b, outcomeB);
  const upd = (uid: string, s: ReturnType<typeof stats>) =>
    db
      .prepare(
        "UPDATE ratings SET rating = ?, peak = ?, played = ?, wins = ?, losses = ?, draws = ?, streak = ?, best_streak = ?, updated_at = ? WHERE user_id = ?",
      )
      .bind(s.rating, s.peak, s.played, s.wins, s.losses, s.draws, s.streak, s.bestStreak, now, uid);
  const hist = (uid: string, before: number, after: number) =>
    db
      .prepare("INSERT OR IGNORE INTO rating_history (user_id, match_id, rating_before, rating_after, delta, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(uid, r.code, before, after, after - before, now);
  await db.batch([
    upd(a, sa),
    upd(b, sb),
    hist(a, ra.rating, res.a.rating),
    hist(b, rb.rating, res.b.rating),
    db.prepare("UPDATE matches SET delta0 = ?, delta1 = ?, flag = ? WHERE id = ?").bind(res.deltaA, res.deltaB, res.farmed ? "repeat" : null, r.code),
  ]);
}

/** XP always; Qızıl only for rated matches. Capped per Baku day, so repeating matches does not farm rewards. */
async function reward(db: D1Database, r: MatchResult, seat: 0 | 1, uid: string, now: number): Promise<void> {
  if (r.mode === "training") {
    const used = await gainedToday(db, uid, "xp", "bot_match", now);
    const xp = Math.min(ECONOMY.bot.xpPerMatch, Math.max(0, ECONOMY.bot.dailyXpCap - used));
    await credit(db, uid, "xp", xp, `bot:${r.code}:${seat}:xp`, "bot_match", now);
    return;
  }
  // matches above the daily limit still count as played, but give no rewards
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM econ_ledger WHERE user_id = ? AND currency = 'xp' AND reason = 'match' AND created_at >= ?")
    .bind(uid, bakuDayStart(now))
    .first<{ n: number }>();
  if ((row?.n ?? 0) >= ECONOMY.matchesPerDay) return;
  const won = r.winner === seat;
  const stagesWon = r.history.filter((h) => h.winner === seat).length;
  const m = ECONOMY.match;
  const xp = m.xpPlayed + (won ? m.xpWon : 0) + stagesWon * m.xpPerStageWon;
  await credit(db, uid, "xp", xp, `match:${r.code}:${seat}:xp`, "match", now);
  if (r.mode === "rated") {
    const qizil = m.qizilPlayed + (won ? m.qizilWon : 0);
    await credit(db, uid, "qizil", qizil, `match:${r.code}:${seat}:qizil`, "match", now);
  }
}
