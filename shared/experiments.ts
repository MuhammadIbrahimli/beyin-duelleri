export const EXPERIMENTS = [
  { id: 1, slug: "refleks", direction: "lower", tiebreak: { key: "earlyTaps", direction: "lower" } },
  { id: 2, slug: "reng-ve-soz", direction: "lower", tiebreak: null },
  { id: 3, slug: "yaddas-zenciri", direction: "higher", tiebreak: { key: "totalMs", direction: "lower" } },
  { id: 4, slug: "yalanci-yaddas", direction: "higher", tiebreak: null },
  { id: 5, slug: "eyni-rengdir", direction: "lower", tiebreak: { key: "totalMs", direction: "lower" } },
  { id: 6, slug: "lovber", direction: "lower", tiebreak: null }, // primary = |answer - truth| / truth, in percent
  { id: 7, slug: "go-no-go", direction: "lower", tiebreak: { key: "commission", direction: "lower" } },
  { id: 8, slug: "reqem-yaddasi", direction: "higher", tiebreak: { key: "totalMs", direction: "lower" } },
  { id: 11, slug: "n-back", direction: "higher", tiebreak: null },
  { id: 13, slug: "dsst", direction: "lower", tiebreak: null },
  { id: 14, slug: "mental-rotation", direction: "lower", tiebreak: null },
  { id: 15, slug: "task-switch", direction: "lower", tiebreak: { key: "switchCostMs", direction: "lower" } },
  { id: 16, slug: "hanoi", direction: "lower", tiebreak: null },
  { id: 20, slug: "visual-search", direction: "lower", tiebreak: { key: "searchSlopeMs", direction: "lower" } },
  { id: 21, slug: "bart", direction: "higher", tiebreak: null },
  { id: 22, slug: "matrix", direction: "higher", tiebreak: null },
  { id: 23, slug: "change-detection", direction: "higher", tiebreak: null },
  { id: 24, slug: "posner", direction: "lower", tiebreak: { key: "orientingCostMs", direction: "lower" } },
  { id: 25, slug: "mot", direction: "higher", tiebreak: null },
  { id: 26, slug: "card-sort", direction: "lower", tiebreak: { key: "perseverative", direction: "lower" } },
  { id: 27, slug: "time-estimation", direction: "lower", tiebreak: null },
  { id: 28, slug: "cognitive-reflection", direction: "higher", tiebreak: null },
  { id: 29, slug: "word-recall", direction: "higher", tiebreak: null },
  { id: 30, slug: "attentional-blink", direction: "higher", tiebreak: { key: "blinkCostPct", direction: "higher" } },
  { id: 31, slug: "syllogism", direction: "higher", tiebreak: null },
  { id: 32, slug: "mental-arithmetic", direction: "lower", tiebreak: null },
] as const;

export type Slug = (typeof EXPERIMENTS)[number]["slug"];
export type ExperimentMeta = (typeof EXPERIMENTS)[number];

export const bySlug = (slug: string): ExperimentMeta | undefined => EXPERIMENTS.find((e) => e.slug === slug);
export const byId = (id: number): ExperimentMeta | undefined => EXPERIMENTS.find((e) => e.id === id);

/** Monday..Saturday = one experiment each; Sunday = "weekly duel" (TODO stage 6: pick the experiment). */
const DAILY_BY_WEEKDAY: Slug[] = ["refleks", "reng-ve-soz", "yaddas-zenciri", "yalanci-yaddas", "eyni-rengdir", "lovber"];
export function dailySlug(date: string): Slug {
  const wd = new Date(date + "T00:00:00Z").getUTCDay(); // 0 = Sunday
  if (wd !== 0) return DAILY_BY_WEEKDAY[wd - 1];
  // Sunday = "weekly duel": cycles through every experiment, one per week
  const week = Math.floor(Date.parse(date + "T00:00:00Z") / (7 * 86400000));
  return EXPERIMENTS[week % EXPERIMENTS.length].slug;
}
/** Calendar day in Azerbaijan (UTC+4, no daylight saving): the daily test and streaks roll over at local midnight. */
export const todayBaku = (now = Date.now()) => new Date(now + 4 * 3600000).toISOString().slice(0, 10);
