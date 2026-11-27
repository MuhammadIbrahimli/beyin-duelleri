// Account level (XP) and the one in-game currency, Qızıl. Both are cosmetic-only economy: neither affects a match.
export const ECONOMY = {
  /** XP needed to climb from level n to n+1: base + step * (n - 1). Levels never go down. */
  xpBase: 100,
  xpStep: 25,
  /** Rewards per finished human match. */
  match: { xpPlayed: 20, xpWon: 15, xpPerStageWon: 3, qizilPlayed: 5, qizilWon: 10 },
  /** Limits so repeating the easiest action does not farm rewards. Matches above `matchesPerDay` still count, but give nothing. */
  matchesPerDay: 10,
  /** Training matches with bots: a little XP, no Qızıl, and a daily XP cap. */
  bot: { xpPerMatch: 5, dailyXpCap: 30 },
};

export function xpForLevel(level: number): number {
  // total XP needed to reach `level` (level 1 needs 0)
  let total = 0;
  for (let l = 1; l < level; l++) total += ECONOMY.xpBase + ECONOMY.xpStep * (l - 1);
  return total;
}

export function levelForXp(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  const base = xpForLevel(level);
  return { level, into: xp - base, need: xpForLevel(level + 1) - base };
}
