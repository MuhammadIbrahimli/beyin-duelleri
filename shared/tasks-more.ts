// Four more tasks, written from public paradigm descriptions (no code copied):
//  - Psychomotor vigilance (PVT, Dinges & Powell, 1985): tap as soon as a dot appears after a random wait.
//  - Symbol-digit substitution (DSST, Wechsler): look up the symbol that belongs to each digit.
//  - Mental rotation (Shepard & Metzler, 1971): is the right figure the left one turned, not mirrored?
//  - Task switching (Rogers & Monsell, 1995): the cue colour says which rule to use (odd/even or below/above 5).
// Scores, thresholds and penalties are starter values (TODO(verify)), see config/points.ts and config/levels.ts.
import type { Scorer } from "./scoring";
import { median } from "./stats";
import { randInt, rng, shuffle } from "./rng";
import { hasImpossibleReaction } from "./validity";

export const PVT_TRIALS = 12;
export const PVT_LAPSE_MS = 2000; // no tap in this time counts as a lapse (recorded as this value)
export const DSST_TRIALS = 30;
export const ROTATION_TRIALS = 12;
export const SWITCH_TRIALS = 30;
const ERROR_PENALTY_MS = 1000; // added to the mean correct reaction for a 100% error rate

// ---- shared judging of two-choice answers --------------------------------------------------
interface Judged { expected: string; cond?: "base" | "cost" }
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export function judge(trials: Judged[], payload: unknown, allowed: readonly string[]) {
  const p = payload as { choices?: unknown; times?: unknown };
  if (!Array.isArray(p?.choices) || !Array.isArray(p?.times)) return null;
  const choices = p.choices as (string | null)[], times = p.times as number[];
  if (choices.length !== trials.length || times.length !== trials.length) return null;
  if (!choices.every((c) => c === null || allowed.includes(c as string))) return null;
  if (!times.every((x) => Number.isFinite(x) && x >= 0 && x < 5000)) return null;
  const correct: number[] = [], base: number[] = [], cost: number[] = [];
  let errors = 0;
  trials.forEach((tr, i) => {
    if (choices[i] === tr.expected) {
      correct.push(times[i]);
      if (tr.cond === "base") base.push(times[i]);
      if (tr.cond === "cost") cost.push(times[i]);
    } else errors++;
  });
  return { errors, errorRate: errors / trials.length, correct, base, cost };
}

export function finish(j: NonNullable<ReturnType<typeof judge>>, extra: Record<string, number> = {}) {
  const invalidReason = hasImpossibleReaction(j.correct) ? "too_fast" : j.errorRate > 0.5 ? "guessing" : j.correct.length === 0 ? "no_hits" : undefined;
  return {
    primary: Math.round(mean(j.correct) + ERROR_PENALTY_MS * j.errorRate),
    secondary: { errors: j.errors, meanMs: Math.round(mean(j.correct)), ...extra },
    valid: !invalidReason,
    invalidReason,
  };
}

// ---- PVT ------------------------------------------------------------------------------------------
export interface PvtSchedule { foreperiods: number[] }

export const pvt: Scorer<PvtSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    return { foreperiods: Array.from({ length: PVT_TRIALS }, () => randInt(r, 1500, 4000)) };
  },
  minDurationMs: (s) => s.foreperiods.reduce((a, b) => a + b, 0),
  score(_s, payload) {
    const p = payload as { times?: unknown; falseStarts?: unknown };
    if (!Array.isArray(p?.times) || p.times.length !== PVT_TRIALS) return null;
    if (!p.times.every((x) => x === null || (typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= PVT_LAPSE_MS))) return null;
    if (!Number.isInteger(p.falseStarts) || (p.falseStarts as number) < 0 || (p.falseStarts as number) > 60) return null;
    const times = p.times as (number | null)[];
    const hits = times.filter((x): x is number => x !== null);
    const lapses = times.length - hits.length;
    const falseStarts = p.falseStarts as number;
    const withLapses = times.map((x) => (x === null ? PVT_LAPSE_MS : x));
    const invalidReason = hasImpossibleReaction(hits) ? "too_fast" : falseStarts > PVT_TRIALS / 2 ? "false_starts" : undefined;
    return {
      primary: Math.round(median(withLapses)), // median with lapses counted as the lapse time: robust to one slow trial
      secondary: { lapses, falseStarts, meanMs: Math.round(mean(hits)) },
      valid: !invalidReason,
      invalidReason,
    };
  },
};

// ---- DSST: symbol-digit substitution -----------------------------------------------------------
export const SYMBOLS = ["▲", "●", "■", "◆", "★", "✚", "✖", "◐", "⬢"];
export interface DsstSchedule { symbols: string[]; digits: number[] }

export const dsst: Scorer<DsstSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    const symbols = shuffle(r, SYMBOLS); // digit d (1..9) belongs to symbols[d-1]; the mapping changes each run
    const digits = Array.from({ length: DSST_TRIALS }, () => randInt(r, 1, 9));
    return { symbols, digits };
  },
  minDurationMs: (s) => s.digits.length * 300,
  score(s, payload) {
    const trials: Judged[] = s.digits.map((d) => ({ expected: s.symbols[d - 1] }));
    const j = judge(trials, payload, s.symbols);
    return j ? finish(j) : null;
  },
};

// ---- Mental rotation --------------------------------------------------------------------------------
export type Pt = [number, number];
export interface RotationTrial { left: Pt[]; right: Pt[]; same: boolean }
export interface RotationSchedule { trials: RotationTrial[] }

/** Random 6-point path on a grid, centred and scaled to fit in a unit circle. */
function randomPath(r: () => number): Pt[] {
  const dirs: Pt[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (;;) {
    const pts: Pt[] = [[0, 0]];
    let dir = -1, ok = true;
    for (let k = 0; k < 5 && ok; k++) {
      const options = dirs.filter((d, i) => i !== dir && !(dir >= 0 && d[0] === -dirs[dir][0] && d[1] === -dirs[dir][1]));
      const d = options[randInt(r, 0, options.length - 1)];
      dir = dirs.indexOf(d);
      const last = pts[pts.length - 1];
      const next: Pt = [last[0] + d[0], last[1] + d[1]];
      if (pts.some((p) => p[0] === next[0] && p[1] === next[1])) ok = false; else pts.push(next);
    }
    if (ok) return normalise(pts);
  }
}

function normalise(pts: Pt[]): Pt[] {
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const c = pts.map(([x, y]): Pt => [x - cx, y - cy]);
  const max = Math.max(...c.map(([x, y]) => Math.hypot(x, y))) || 1;
  return c.map(([x, y]): Pt => [round3(x / max), round3(y / max)]);
}
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** Rotate by a multiple of 60 degrees, after an optional mirror across the vertical axis. */
export function transform(pts: Pt[], deg: number, mirror: boolean): Pt[] {
  const a = (deg * Math.PI) / 180;
  return pts.map(([x0, y0]): Pt => {
    const x = mirror ? -x0 : x0;
    return [round3(x * Math.cos(a) - y0 * Math.sin(a)), round3(x * Math.sin(a) + y0 * Math.cos(a))];
  });
}

/** True when two paths coincide point by point (within a small tolerance). */
const samePath = (a: Pt[], b: Pt[]) => a.every((p, i) => Math.abs(p[0] - b[i][0]) < 0.02 && Math.abs(p[1] - b[i][1]) < 0.02);

export const rotation: Scorer<RotationSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    const sames = shuffle(r, [...Array(ROTATION_TRIALS / 2).fill(true), ...Array(ROTATION_TRIALS / 2).fill(false)] as boolean[]);
    const trials = sames.map((same): RotationTrial => {
      for (;;) {
        const left = randomPath(r);
        const deg = randInt(r, 1, 5) * 60;
        if (same) return { left, right: transform(left, deg, false), same: true };
        // a mirror image that is not also a rotation of the original; otherwise the right answer would be "same"
        const mirrored = transform(left, deg, true);
        const isRotation = [0, 1, 2, 3, 4, 5].some((k) => samePath(transform(left, k * 60, false), mirrored));
        if (!isRotation) return { left, right: mirrored, same: false };
      }
    });
    return { trials };
  },
  minDurationMs: (s) => s.trials.length * 1200,
  score(s, payload) {
    const trials: Judged[] = s.trials.map((t) => ({ expected: t.same ? "yes" : "no" }));
    const j = judge(trials, payload, ["yes", "no"]);
    return j ? finish(j) : null;
  },
};

// ---- Task switching ---------------------------------------------------------------------------------
export type Cue = "parity" | "magnitude";
export interface SwitchTrial { digit: number; cue: Cue; expected: "left" | "right"; cond?: "base" | "cost" }
export interface SwitchSchedule { trials: SwitchTrial[] }
const DIGITS = [1, 2, 3, 4, 6, 7, 8, 9]; // no 5: it is neither odd nor even, nor above or below

/** Parity cue: odd = left, even = right. Magnitude cue: below 5 = left, above 5 = right. */
export const switchAnswer = (digit: number, cue: Cue): "left" | "right" =>
  cue === "parity" ? (digit % 2 === 1 ? "left" : "right") : digit < 5 ? "left" : "right";

export const switchTask: Scorer<SwitchSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    const trials: SwitchTrial[] = [];
    let cue: Cue = r() < 0.5 ? "parity" : "magnitude";
    for (let i = 0; i < SWITCH_TRIALS; i++) {
      if (i > 0 && r() < 0.5) cue = cue === "parity" ? "magnitude" : "parity"; // a switch on about half of the trials
      const digit = DIGITS[randInt(r, 0, DIGITS.length - 1)];
      const switched = i > 0 && trials[i - 1].cue !== cue;
      trials.push({ digit, cue, expected: switchAnswer(digit, cue), cond: i === 0 ? undefined : switched ? "cost" : "base" });
    }
    return { trials };
  },
  minDurationMs: (s) => s.trials.length * 300,
  score(s, payload) {
    const trials: Judged[] = s.trials.map((t) => ({ expected: t.expected, cond: t.cond }));
    const j = judge(trials, payload, ["left", "right"]);
    if (!j) return null;
    const switchCost = Math.round(mean(j.cost) - mean(j.base));
    return finish(j, { switchCostMs: switchCost });
  },
};

export const SCORERS_MORE: Record<string, Scorer<any>> = {
  pvt,
  dsst,
  "mental-rotation": rotation,
  "task-switch": switchTask,
};
