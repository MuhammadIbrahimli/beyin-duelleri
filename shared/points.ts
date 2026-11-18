import { POINT_CURVES } from "../config/points";

/** 0-100 points for one raw result (piecewise linear over the experiment's curve). */
export function pointsFor(slug: string, raw: number): number {
  const c = POINT_CURVES[slug];
  if (!c || !Number.isFinite(raw)) return 0;
  if (raw <= c[0][0]) return Math.round(c[0][1]);
  if (raw >= c[c.length - 1][0]) return Math.round(c[c.length - 1][1]);
  for (let i = 1; i < c.length; i++) {
    const [x0, y0] = c[i - 1], [x1, y1] = c[i];
    if (raw <= x1) return Math.round(y0 + ((raw - x0) / (x1 - x0)) * (y1 - y0));
  }
  return 0;
}

/**
 * "Beyin balı": the average of the best points per experiment, over ALL experiments.
 * An experiment you have not played counts as 0, so the score rewards trying everything.
 */
export function overallScore(bestPoints: number[], totalExperiments: number): number {
  if (totalExperiments <= 0) return 0;
  return Math.round((bestPoints.reduce((a, b) => a + b, 0) / totalExperiments) * 10) / 10; // one decimal keeps the ranking fine-grained
}
