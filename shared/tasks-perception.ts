// Two perception tasks with mechanisms the app does not have yet (written from public paradigm descriptions, no code copied):
//  - Random-dot motion (Newsome & Paré, 1988): most dots drift together in one direction; the signal is hidden in the noise.
//  - Numerosity (subitizing and estimation, Kaufman et al., 1949): a brief flash of dots; say how many there were.
// Scores, thresholds and penalties are starter values (TODO(verify)), see config/points.ts and config/levels.ts.
import type { Scorer } from "./scoring";
import { randInt, rng, shuffle } from "./rng";

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

// ---- Random-dot motion ---------------------------------------------------------------------------------
export const MOTION_TRIALS = 12;
export const MOTION_LEVELS = [0.8, 0.5, 0.25]; // share of dots that move together: easy, medium, hard
export interface MotionTrial { dir: "left" | "right"; coherence: number; seed: number; cond: "base" | "cost" }
export interface MotionSchedule { trials: MotionTrial[] }

export const motion: Scorer<MotionSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    const dirs = shuffle(r, [...Array(MOTION_TRIALS / 2).fill("left"), ...Array(MOTION_TRIALS / 2).fill("right")] as ("left" | "right")[]);
    const trials = dirs.map((dir, i): MotionTrial => {
      const coherence = MOTION_LEVELS[i % MOTION_LEVELS.length];
      return { dir, coherence, seed: randInt(r, 1, 2 ** 31 - 2), cond: coherence === MOTION_LEVELS[0] ? "base" : "cost" };
    });
    return { trials };
  },
  minDurationMs: (s) => s.trials.length * 1500,
  score(s, payload) {
    const choices = (payload as { choices?: unknown })?.choices;
    if (!Array.isArray(choices) || choices.length !== s.trials.length) return null;
    if (!choices.every((c) => c === "left" || c === "right")) return null;
    const correct = s.trials.filter((t, i) => choices[i] === t.dir).length;
    return { primary: Math.round((correct / s.trials.length) * 100), secondary: { errors: s.trials.length - correct, trials: s.trials.length }, valid: true }; // percent correct, higher is better
  },
};

// ---- Numerosity ------------------------------------------------------------------------------------------
export const NUMEROSITY_TRIALS = 12;
export interface NumerosityTrial { n: number; seed: number }
export interface NumerositySchedule { trials: NumerosityTrial[] }

export const numerosity: Scorer<NumerositySchedule> = {
  schedule(seed) {
    const r = rng(seed);
    return {
      trials: Array.from({ length: NUMEROSITY_TRIALS }, (_, i) => ({
        n: randInt(r, 1, 12),
        seed: randInt(r, 1, 2 ** 31 - 2) + i,
      })),
    };
  },
  minDurationMs: (s) => s.trials.length * 800,
  publicView: (s) => ({ trials: s.trials.map((t) => ({ seed: t.seed, n: t.n })) }), // the dots are the stimulus; they show n anyway
  score(s, payload) {
    const answers = (payload as { answers?: unknown })?.answers;
    if (!Array.isArray(answers) || answers.length !== s.trials.length) return null;
    if (!answers.every((x) => Number.isInteger(x) && x >= 0 && x <= 99)) return null;
    const errors = s.trials.map((t, i) => Math.abs((answers[i] as number) - t.n));
    return {
      primary: Math.round(mean(errors) * 100) / 100, // mean absolute error in dots; lower is better
      secondary: { exact: errors.filter((e) => e === 0).length, trials: s.trials.length },
      valid: true,
    };
  },
};

export const SCORERS_PERCEPTION: Record<string, Scorer<any>> = {
  "random-dot-motion": motion,
  numerosity,
};
