export const EXPERIMENTS = [
  { id: 1, slug: "refleks", direction: "lower", tiebreak: { key: "earlyTaps", direction: "lower" } },
  { id: 2, slug: "reng-ve-soz", direction: "lower", tiebreak: null },
  { id: 3, slug: "yaddas-zenciri", direction: "higher", tiebreak: { key: "totalMs", direction: "lower" } },
  { id: 4, slug: "yalanci-yaddas", direction: "higher", tiebreak: null },
  { id: 5, slug: "eyni-rengdir", direction: "lower", tiebreak: { key: "totalMs", direction: "lower" } },
  { id: 6, slug: "lovber", direction: "lower", tiebreak: null }, // primary = |answer - truth|
] as const;

export type Slug = (typeof EXPERIMENTS)[number]["slug"];
export type ExperimentMeta = (typeof EXPERIMENTS)[number];

export const bySlug = (slug: string): ExperimentMeta | undefined => EXPERIMENTS.find((e) => e.slug === slug);
export const byId = (id: number): ExperimentMeta | undefined => EXPERIMENTS.find((e) => e.id === id);

/** Monday..Saturday = one experiment each; Sunday = "weekly duel" (TODO stage 6: pick the experiment). */
const DAILY_BY_WEEKDAY: Slug[] = ["refleks", "reng-ve-soz", "yaddas-zenciri", "yalanci-yaddas", "eyni-rengdir", "lovber"];
export function dailySlug(date: string): Slug {
  const wd = new Date(date + "T00:00:00Z").getUTCDay(); // 0 = Sunday
  return wd === 0 ? "refleks" : DAILY_BY_WEEKDAY[wd - 1];
}
export const todayUTC = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
