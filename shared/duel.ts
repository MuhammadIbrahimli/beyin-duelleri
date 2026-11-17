import type { ExperimentMeta } from "./experiments";

export interface DuelRun {
  valid: boolean;
  primary: number;
  secondary: Record<string, number>;
  finishedAt: number;
}

const cmp = (a: number, b: number, dir: "lower" | "higher") => (a === b ? 0 : (dir === "lower" ? a < b : a > b) ? 1 : -1);

/** 1 = a wins, -1 = b wins, 0 = tie. A valid run always beats an invalid one. */
export function compareRuns(meta: ExperimentMeta, a: DuelRun, b: DuelRun): 1 | 0 | -1 {
  if (a.valid !== b.valid) return a.valid ? 1 : -1;
  let r = cmp(a.primary, b.primary, meta.direction);
  if (r === 0 && meta.tiebreak) {
    const k = meta.tiebreak.key;
    const av = a.secondary[k], bv = b.secondary[k];
    if (av !== undefined && bv !== undefined) r = cmp(av, bv, meta.tiebreak.direction);
  }
  return r as 1 | 0 | -1;
}

/** Ranks 1..n (ties share a rank). Input order is irrelevant; output matches input order. */
export function rankRuns(meta: ExperimentMeta, runs: DuelRun[]): number[] {
  return runs.map((r) => 1 + runs.filter((o) => compareRuns(meta, o, r) === 1).length);
}

export type Outcome = "win" | "lose" | "tie";
export function outcomeFor(meta: ExperimentMeta, me: DuelRun, other: DuelRun): Outcome {
  const c = compareRuns(meta, me, other);
  return c === 1 ? "win" : c === -1 ? "lose" : "tie";
}
