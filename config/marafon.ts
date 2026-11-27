// Marafon: a single-player survival run. Three lives; a wrong or late answer costs one life.
// Difficulty rises gently: every `tasksPerLevel` correct answers raise the level by one (capped).
export const MARAFON = {
  lives: 3,
  tasksPerLevel: 5,
  maxLevel: 10,
  /** how long a player has to answer, per kind of task (ms) */
  limitMs: { arithmetic: 9000, sequence: 10000, riddle: 15000, odd: 6000, memory: 12000, reaction: 2500 },
  /** a reaction cannot be faster than this, so a script that answers instantly is refused */
  minHumanMs: 150,
  /** points: correct task = base + level bonus */
  pointsBase: 10,
  pointsPerLevel: 2,
  /** a rewarded record (best score in a week) gives XP once per Baku week */
  recordXp: 25,
  /** kinds rotate so the same kind does not come more than twice in a row */
  kinds: ["arithmetic", "sequence", "riddle", "odd", "memory", "reaction"] as const,
};
