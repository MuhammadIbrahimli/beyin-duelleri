// Three tasks with mechanisms the app does not have yet (written from public paradigm descriptions, no code copied):
//  - Line bisection (Schenkenberg, 1980): mark the middle of a line; the signed error shows where attention leans.
//  - Iowa gambling task (Bechara et al., 1994): four decks, two pay more in the long run; learn it from outcomes.
//  - Pitch discrimination (psychophysics): which of two tones is higher; the score is percent correct.
// Scores, thresholds and penalties are starter values (TODO(verify)), see config/points.ts and config/levels.ts.
import type { Scorer } from "./scoring";
import { randInt, rng, shuffle } from "./rng";

// ---- Line bisection -------------------------------------------------------------------------------------
export const BISECT_TRIALS = 10;
export interface BisectLine { x1: number; x2: number } // percent of the field width
export interface BisectSchedule { lines: BisectLine[] }

export const bisection: Scorer<BisectSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    return {
      lines: Array.from({ length: BISECT_TRIALS }, () => ({ x1: randInt(r, 4, 20), x2: randInt(r, 80, 96) })),
    };
  },
  minDurationMs: (s) => s.lines.length * 800,
  score(s, payload) {
    const taps = (payload as { taps?: unknown })?.taps;
    if (!Array.isArray(taps) || taps.length !== s.lines.length) return null;
    if (!taps.every((x) => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 100)) return null;
    const signed = s.lines.map((l, i) => (taps[i] as number) - (l.x1 + l.x2) / 2);
    const absMean = signed.reduce((a, b) => a + Math.abs(b), 0) / signed.length;
    const bias = signed.reduce((a, b) => a + b, 0) / signed.length;
    return {
      primary: Math.round(absMean * 10) / 10, // mean absolute error in percent of the line; lower is better
      secondary: { biasPct: Math.round(bias * 10) / 10 }, // positive: the marks lean right of the middle
      valid: true,
    };
  },
};

// ---- Iowa gambling task ---------------------------------------------------------------------------------------
export const IOWA_TRIALS = 60;
export const IOWA_DECKS = ["A", "B", "C", "D"] as const;
export interface IowaSchedule { outcomes: Record<(typeof IOWA_DECKS)[number], number[]> }

/** Gain on every card, and a loss on some. A and B lose money on average; C and D make money. */
const DECK_RULES: Record<(typeof IOWA_DECKS)[number], { gain: number; loss: number; p: number }> = {
  A: { gain: 100, loss: -250, p: 0.5 },   // average -25 per card
  B: { gain: 100, loss: -1250, p: 0.1 },  // average -25, but rare big losses
  C: { gain: 50, loss: -50, p: 0.2 },     // average +30
  D: { gain: 50, loss: -250, p: 0.1 },    // average +25
};

export const iowa: Scorer<IowaSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    const outcomes = {} as IowaSchedule["outcomes"];
    for (const d of IOWA_DECKS) {
      const rule = DECK_RULES[d];
      outcomes[d] = Array.from({ length: IOWA_TRIALS }, () => rule.gain + (r() < rule.p ? rule.loss : 0));
    }
    return { outcomes };
  },
  minDurationMs: () => IOWA_TRIALS * 700,
  // no publicView: the client shows the outcome of each choice, so it needs the outcomes (same trust level as the other feedback tests)
  score(s, payload) {
    const choices = (payload as { choices?: unknown })?.choices;
    if (!Array.isArray(choices) || choices.length !== IOWA_TRIALS) return null;
    if (!choices.every((c) => Number.isInteger(c) && c >= 0 && c <= 3)) return null;
    const counts = [0, 0, 0, 0];
    let net = 0;
    choices.forEach((c, i) => {
      const deck = IOWA_DECKS[c as number];
      net += s.outcomes[deck][i];
      counts[c as number]++;
    });
    return {
      primary: net, // total gain minus total loss; higher is better
      secondary: { deckA: counts[0], deckB: counts[1], deckC: counts[2], deckD: counts[3] },
      valid: true,
    };
  },
};

// ---- Pitch discrimination -----------------------------------------------------------------------------------
export const PITCH_TRIALS = 16;
export const PITCH_RATIOS = [1.2, 1.1, 1.05];   // easy, medium, hard
export interface PitchTrial { base: number; ratio: number; higher: "first" | "second"; cond: "base" | "cost" }
export interface PitchSchedule { trials: PitchTrial[] }

export const pitch: Scorer<PitchSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    const firstHigher = shuffle(r, [...Array(PITCH_TRIALS / 2).fill("first"), ...Array(PITCH_TRIALS / 2).fill("second")] as ("first" | "second")[]);
    const trials = firstHigher.map((higher, i): PitchTrial => {
      const ratio = PITCH_RATIOS[i % PITCH_RATIOS.length];
      return { base: randInt(r, 330, 550), ratio, higher, cond: ratio === PITCH_RATIOS[0] ? "base" : "cost" };
    });
    return { trials };
  },
  minDurationMs: (s) => s.trials.length * 1200,
  score(s, payload) {
    const choices = (payload as { choices?: unknown })?.choices;
    if (!Array.isArray(choices) || choices.length !== s.trials.length) return null;
    if (!choices.every((c) => c === "first" || c === "second")) return null;
    const correct = s.trials.filter((t, i) => choices[i] === t.higher).length;
    return { primary: Math.round((correct / s.trials.length) * 100), secondary: { trials: s.trials.length }, valid: true }; // percent correct
  },
};

export const SCORERS_SENSORY: Record<string, Scorer<any>> = {
  "line-bisection": bisection,
  "iowa-gambling": iowa,
  "pitch-discrimination": pitch,
};
