// Seasons (30 days) and weekly events. Events are only configuration: a new event needs no code change.
// Times are Baku local dates (UTC+4, no daylight saving). A season end never deletes progress: the best result,
// the history and the cosmetic rewards stay; the rating moves a little toward the start value (soft correction).
export const SEASON = {
  /** first day of season 1 (Baku date, YYYY-MM-DD) */
  startDate: "2026-12-01",
  lengthDays: 30,
  /** at the end of a season the rating keeps this share of its distance from the starting rating */
  softKeep: 0.75,
};

export interface EventDef {
  id: string;
  title: { az: string; ru: string };
  description: { az: string; ru: string };
  /** Baku dates, both inclusive */
  from: string;
  to: string;
  /** effect while the event runs: an XP multiplier for finished human matches */
  xpMultiplier: number;
  enabled: boolean;
}

export const EVENTS: EventDef[] = [
  {
    id: "refleks_turniri",
    title: { az: "Refleks turniri", ru: "Турнир рефлексов" },
    description: { az: "Bu həftə matçlara görə XP ikiqat", ru: "На этой неделе XP за матчи удвоен" },
    from: "2026-12-01",
    to: "2026-12-07",
    xpMultiplier: 2,
    enabled: false,
  },
];
