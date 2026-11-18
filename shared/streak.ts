const DAY = 86400000;
export const dayAdd = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);

/** Monday of the week that contains `d` (weeks run Monday to Sunday). */
export function weekStart(d: string): string {
  const wd = new Date(d + "T00:00:00Z").getUTCDay(); // 0 = Sunday
  return dayAdd(d, -((wd + 6) % 7));
}

export interface StreakInfo { streak: number; frozen: string[] }

/**
 * Consecutive days with a finished daily test. One missed day per calendar week is forgiven
 * automatically (the "freeze"); a forgiven day keeps the chain alive but does not count as a day.
 * Today not being done yet never breaks the streak.
 */
export function streakWithFreeze(dates: string[], today: string): StreakInfo {
  const done = new Set(dates);
  if (done.size === 0) return { streak: 0, frozen: [] };
  const earliest = [...done].sort()[0];
  const usedWeeks = new Set<string>();
  const frozen: string[] = [];
  let streak = 0;
  let d = done.has(today) ? today : dayAdd(today, -1);
  for (;;) {
    if (done.has(d)) { streak++; d = dayAdd(d, -1); continue; }
    const wk = weekStart(d);
    if (d > earliest && !usedWeeks.has(wk)) { usedWeeks.add(wk); frozen.push(d); d = dayAdd(d, -1); continue; }
    break;
  }
  return { streak, frozen };
}

/** The seven days (Monday first) of the week containing `today`. */
export const weekDays = (today: string) => Array.from({ length: 7 }, (_, i) => dayAdd(weekStart(today), i));
