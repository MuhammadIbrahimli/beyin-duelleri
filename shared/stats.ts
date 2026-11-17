import { CITY_MIN_PARTICIPANTS, OTHER_CITY, PERCENTILE_MIN_RUNS } from "../config/cities";

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function median(values: number[]): number {
  return quantile([...values].sort((a, b) => a - b), 0.5);
}

export interface CityRow { city: string | null; score: number }
export interface CityStat { city: string; n: number; median: number; p25: number; p75: number }

/** Cities below the participant threshold are folded into "diger". Median, not mean. */
export function buildCityStats(rows: CityRow[]): CityStat[] {
  const byCity = new Map<string, number[]>();
  for (const r of rows) {
    const c = r.city ?? OTHER_CITY;
    (byCity.get(c) ?? byCity.set(c, []).get(c)!).push(r.score);
  }
  const merged = new Map<string, number[]>();
  for (const [city, scores] of byCity) {
    const key = scores.length >= CITY_MIN_PARTICIPANTS ? city : OTHER_CITY;
    (merged.get(key) ?? merged.set(key, []).get(key)!).push(...scores);
  }
  const out: CityStat[] = [];
  for (const [city, scores] of merged) {
    const s = scores.sort((a, b) => a - b);
    out.push({ city, n: s.length, median: quantile(s, 0.5), p25: quantile(s, 0.25), p75: quantile(s, 0.75) });
  }
  return out;
}

export const QUANTILE_POINTS = 200;

/** Compress a sorted score list into QUANTILE_POINTS evenly spaced points. */
export function toQuantiles(sorted: number[]): number[] {
  if (sorted.length === 0) return [];
  return Array.from({ length: QUANTILE_POINTS }, (_, i) => quantile(sorted, i / (QUANTILE_POINTS - 1)));
}

/**
 * Share (0-100) of participants this score beats. `null` while there are fewer than
 * PERCENTILE_MIN_RUNS runs, the UI then shows the "early adopter" line instead.
 */
export function percentileBeaten(
  points: number[], n: number, score: number, direction: "lower" | "higher",
): number | null {
  if (n < PERCENTILE_MIN_RUNS || points.length === 0) return null;
  const worse = points.filter((p) => (direction === "lower" ? p > score : p < score)).length;
  return Math.round((worse / points.length) * 100);
}
