// Four tasks with mechanisms the app does not have yet (written from public paradigm descriptions, no code copied):
//  - Inattentional blindness (Mack & Rock, 1998): while a task holds attention, an unexpected object may go unnoticed.
//  - Finger tapping (motor speed): taps in a fixed time; measures the speed of the motor system.
//  - Contrast detection (psychophysics): which of two patches holds a faint pattern; the score is percent correct.
//  - Probability matching (Estes, 1950s): predict a random sequence where one outcome is more frequent; the best strategy is always to predict the frequent one.
// Scores, thresholds and penalties are starter values (TODO(verify)), see config/points.ts and config/levels.ts.
import type { Scorer } from "./scoring";
import { randInt, rng, shuffle } from "./rng";

// ---- Inattentional blindness ---------------------------------------------------------------------------
export const IB_TRIALS = 3;
export interface IbTrial { surprise: boolean; shape: 0 | 1 | 2 | 3; seed: number }
export interface IbSchedule { trials: IbTrial[] }

export const inattentional: Scorer<IbSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    const surprises = shuffle(r, [true, true, false]);
    return {
      trials: surprises.map((surprise) => ({ surprise, shape: randInt(r, 0, 3) as 0 | 1 | 2 | 3, seed: randInt(r, 1, 2 ** 31 - 2) })),
    };
  },
  minDurationMs: (s) => s.trials.length * 6000,
  // the answer per trial: "did you see something unusual?" (yes/no), and for a surprise the shape (0-3)
  score(s, payload) {
    const a = (payload as { answers?: unknown })?.answers;
    if (!Array.isArray(a) || a.length !== s.trials.length) return null;
    if (!a.every((x) => x && typeof x === "object" && typeof (x as any).seen === "boolean" && Number.isInteger((x as any).shape) && (x as any).shape >= -1 && (x as any).shape <= 3)) return null;
    let correct = 0;
    s.trials.forEach((t, i) => {
      const x = a[i] as { seen: boolean; shape: number };
      if (t.surprise) { if (x.seen && x.shape === t.shape) correct++; }
      else if (!x.seen) correct++;
    });
    return { primary: Math.round((correct / s.trials.length) * 100), secondary: { trials: s.trials.length }, valid: true };
  },
};

// ---- Finger tapping --------------------------------------------------------------------------------------
export const TAP_TRIALS = 2;
export const TAP_MS = 10000;
export interface TapSchedule { trials: number }

export const tapping: Scorer<TapSchedule> = {
  schedule: () => ({ trials: TAP_TRIALS }),
  minDurationMs: () => TAP_TRIALS * TAP_MS,
  score(_s, payload) {
    const taps = (payload as { taps?: unknown })?.taps;
    if (!Array.isArray(taps) || taps.length !== TAP_TRIALS) return null;
    if (!taps.every((x) => Number.isInteger(x) && x >= 0 && x <= 200)) return null;
    const mean = (taps as number[]).reduce((a, b) => a + b, 0) / TAP_TRIALS;
    // more than 12 taps per second is not plausible with a finger: the run is not trusted
    const invalidReason = (taps as number[]).some((x) => x > 120) ? "impossible_rate" : undefined;
    return { primary: Math.round(mean), secondary: { best: Math.max(...(taps as number[])) }, valid: !invalidReason, invalidReason };
  },
};

// ---- Contrast detection ------------------------------------------------------------------------------------
export const CONTRAST_TRIALS = 12;
export const CONTRAST_LEVELS = [0.5, 0.2, 0.1]; // strong, faint, very faint stripes
export interface ContrastTrial { pattern: "left" | "right"; contrast: number; cond: "base" | "cost" }
export interface ContrastSchedule { trials: ContrastTrial[] }

export const contrast: Scorer<ContrastSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    const sides = shuffle(r, [...Array(CONTRAST_TRIALS / 2).fill("left"), ...Array(CONTRAST_TRIALS / 2).fill("right")] as ("left" | "right")[]);
    return {
      trials: sides.map((pattern, i): ContrastTrial => {
        const c = CONTRAST_LEVELS[i % CONTRAST_LEVELS.length];
        return { pattern, contrast: c, cond: c === CONTRAST_LEVELS[0] ? "base" : "cost" };
      }),
    };
  },
  minDurationMs: (s) => s.trials.length * 1200,
  score(s, payload) {
    const choices = (payload as { choices?: unknown })?.choices;
    if (!Array.isArray(choices) || choices.length !== s.trials.length) return null;
    if (!choices.every((c) => c === "left" || c === "right")) return null;
    const correct = s.trials.filter((t, i) => choices[i] === t.pattern).length;
    return { primary: Math.round((correct / s.trials.length) * 100), secondary: { trials: s.trials.length }, valid: true };
  },
};

// ---- Probability matching -----------------------------------------------------------------------------------
export const MATCH_TRIALS = 30;
export interface MatchSchedule { outcomes: ("A" | "B")[] }

export const matching: Scorer<MatchSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    // A comes up 70% of the time, independently on each trial
    return { outcomes: Array.from({ length: MATCH_TRIALS }, () => (r() < 0.7 ? "A" : "B")) as ("A" | "B")[] };
  },
  minDurationMs: (s) => s.outcomes.length * 900,
  score(s, payload) {
    const choices = (payload as { choices?: unknown })?.choices;
    if (!Array.isArray(choices) || choices.length !== s.outcomes.length) return null;
    if (!choices.every((c) => c === "A" || c === "B")) return null;
    const correct = s.outcomes.filter((o, i) => choices[i] === o).length;
    return {
      primary: Math.round((correct / s.outcomes.length) * 100), // percent right; always predicting A gives about 70
      secondary: { chosenA: choices.filter((c) => c === "A").length, trials: s.outcomes.length },
      valid: true,
    };
  },
};

export const SCORERS_BATCH60: Record<string, Scorer<any>> = {
  "inattentional-blindness": inattentional,
  "finger-tapping": tapping,
  "contrast-detection": contrast,
  "probability-matching": matching,
};
