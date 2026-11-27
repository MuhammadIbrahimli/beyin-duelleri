// Calendar in Asia/Baku (UTC+4, no daylight saving). Days and weeks (Monday start) are the periods of quests and battles.
import { bakuDay, bakuDayStart } from "./economy-core";

const DAY = 24 * 60 * 60 * 1000;

/** Baku date of a moment, YYYY-MM-DD. */
export const dayKey = (now: number) => bakuDay(now);

/** Monday 00:00 Baku of the week that contains `now`, as a timestamp. */
export function weekStart(now: number): number {
  const dow = new Date(bakuDay(now) + "T00:00:00Z").getUTCDay(); // 0 = Sunday
  const mondayOffset = (dow + 6) % 7;
  return bakuDayStart(now) - mondayOffset * DAY;
}

/** Key of the Baku week: the Monday's date, YYYY-MM-DD. */
export const weekKey = (now: number) => bakuDay(weekStart(now));
