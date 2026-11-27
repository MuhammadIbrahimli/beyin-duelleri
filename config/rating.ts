// Competitive rating ("reytinq"), separate from Beyin balı (cognitive experiments) and from the account level (XP).
// Elo with a calibration period. All numbers are starting values to tune on real results.
export const RATING = {
  /** A new player starts in the first league. */
  start: 300,
  floor: 0,
  /** K factor for the first `calibrationMatches` rated matches (the rating settles quickly), then `kRegular`. */
  kCalibration: 48,
  calibrationMatches: 5,
  kRegular: 24,
  /** Anti-farming: rated matches between the same two accounts inside this window count, and the ones after `repeatLimit` give no rating. */
  repeatWindowMs: 24 * 60 * 60 * 1000,
  repeatLimit: 3,
};

/** Leagues by the lowest rating in them (ascending). Names are localised in the client (src/i18n). */
export const LEAGUES = [
  { id: "burunc", min: 0 },
  { id: "gumus", min: 500 },
  { id: "qizil", min: 1000 },
  { id: "platin", min: 1500 },
  { id: "almaz", min: 2000 },
  { id: "ustad", min: 2500 },
  { id: "efsane", min: 3000 },
] as const;
export type LeagueId = (typeof LEAGUES)[number]["id"];
