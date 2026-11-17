import { LEVELS } from "../config/levels";

export type Level = 1 | 2 | 3 | 4;

/** 1..4, or null for experiments without levels (lovber). */
export function levelFor(slug: string, score: number): Level | null {
  const r = LEVELS[slug];
  if (!r) return null;
  const ok = (t: number) => (r.direction === "lower" ? score < t : score >= t);
  if (ok(r.l4)) return 4;
  if (ok(r.l3)) return 3;
  if (ok(r.l2)) return 2;
  return 1;
}
