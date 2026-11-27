// Competitive rating: Elo with a calibration period, leagues, streaks and anti-farming.
// Pure functions. The server computes every change; clients never send a rating.
import { LEAGUES, RATING, type LeagueId } from "../config/rating";

export interface Player {
  rating: number;
  played: number;       // rated matches finished before this one
  streak: number;       // + wins in a row, - losses in a row, 0 after a draw
}

export type Score = 1 | 0.5 | 0;

export function expectedScore(own: number, other: number): number {
  return 1 / (1 + Math.pow(10, (other - own) / 400));
}

export function kFactor(played: number): number {
  return played < RATING.calibrationMatches ? RATING.kCalibration : RATING.kRegular;
}

/** Rating of a league by the lowest rating it starts at. */
export function leagueOf(rating: number): LeagueId {
  let found: LeagueId = LEAGUES[0].id;
  for (const l of LEAGUES) if (rating >= l.min) found = l.id;
  return found;
}

export function nextStreak(streak: number, score: Score): number {
  if (score === 0.5) return 0;
  if (score === 1) return streak > 0 ? streak + 1 : 1;
  return streak < 0 ? streak - 1 : -1;
}

/**
 * The result of one rated match between two accounts. `repeats` is how many rated matches these two have already
 * played in the repeat window. From the `repeatLimit`-th repeat on, the match changes no rating for either side.
 */
export function applyRated(a: Player, b: Player, scoreA: Score, repeats: number): { a: Player; b: Player; deltaA: number; deltaB: number; farmed: boolean } {
  const farmed = repeats >= RATING.repeatLimit;
  const ea = expectedScore(a.rating, b.rating);
  const eb = expectedScore(b.rating, a.rating);
  const rawA = farmed ? 0 : Math.round(kFactor(a.played) * (scoreA - ea));
  const rawB = farmed ? 0 : Math.round(kFactor(b.played) * ((1 - scoreA) - eb));
  const newA = Math.max(RATING.floor, a.rating + rawA);
  const newB = Math.max(RATING.floor, b.rating + rawB);
  return {
    a: { rating: newA, played: a.played + 1, streak: nextStreak(a.streak, scoreA) },
    b: { rating: newB, played: b.played + 1, streak: nextStreak(b.streak, (1 - scoreA) as Score) },
    deltaA: newA - a.rating,
    deltaB: newB - b.rating,
    farmed,
  };
}

/** Score of a finished match for seat 0: a win, a loss or a draw. Winner -1 is a draw. */
export function scoreForSeat0(winner: 0 | 1 | -1): Score {
  return winner === 0 ? 1 : winner === 1 ? 0 : 0.5;
}
