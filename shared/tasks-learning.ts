// Three tasks with mechanisms the app does not have yet (written from public paradigm descriptions, no code copied):
//  - Card sort with feedback (Berg, 1948; Wisconsin-style): find the hidden sorting rule from right/wrong feedback; the rule changes without warning.
//  - Time estimation (interval production): press start and stop when you think a given time has passed; no clock is shown.
//  - Cognitive reflection (Frederick, 2005): short questions where the first answer that comes to mind is wrong.
// Scores, thresholds and penalties are starter values (TODO(verify)), see config/points.ts and config/levels.ts.
import type { Scorer } from "./scoring";
import { rng, shuffle } from "./rng";

// ---- Card sort -----------------------------------------------------------------------------------------
export type Dim = "colour" | "shape" | "count";
export const CARD_RULES: Dim[] = ["colour", "shape", "count", "shape"]; // rule changes after every block
export const CARD_BLOCK = 8;
/** Three key cards; each one has a different value on every dimension, so every rule picks exactly one key. */
export const CARD_KEYS = [
  { colour: 0, shape: 0, count: 1 },
  { colour: 1, shape: 1, count: 2 },
  { colour: 2, shape: 2, count: 3 },
] as const;
export interface CardTrial { card: { colour: number; shape: number; count: number }; rule: Dim; prevRule: Dim | null; correct: number }
export interface CardSchedule { keys: typeof CARD_KEYS; trials: CardTrial[] }

export const cardSort: Scorer<CardSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    const trials: CardTrial[] = [];
    CARD_RULES.forEach((rule, b) => {
      for (let k = 0; k < CARD_BLOCK; k++) {
        const card = { colour: Math.floor(r() * 3), shape: Math.floor(r() * 3), count: 1 + Math.floor(r() * 3) };
        const correct = CARD_KEYS.findIndex((key) => key[rule] === card[rule]); // exactly one key matches on the rule
        trials.push({ card, rule, prevRule: b === 0 ? null : CARD_RULES[b - 1], correct: correct < 0 ? 0 : correct });
      }
    });
    return { keys: CARD_KEYS, trials };
  },
  minDurationMs: (s) => s.trials.length * 800,
  score(s, payload) {
    const choices = (payload as { choices?: unknown })?.choices;
    if (!Array.isArray(choices) || choices.length !== s.trials.length) return null;
    if (!choices.every((c) => Number.isInteger(c) && c >= 0 && c <= 2)) return null;
    let errors = 0, perseverative = 0;
    s.trials.forEach((t, i) => {
      const c = choices[i] as number;
      if (c === t.correct) return;
      errors++;
      // a perseverative error: the chosen key matches the card on the rule that was just replaced
      if (t.prevRule && (CARD_KEYS[c][t.prevRule] === (t.card as any)[t.prevRule])) perseverative++;
    });
    return {
      primary: errors, // lower is better
      secondary: { perseverative, trials: s.trials.length },
      valid: true,
    };
  },
};

// ---- Time estimation ------------------------------------------------------------------------------------
export const TIME_TARGETS = [1500, 2500, 3500, 2000, 4000, 3000];
export interface TimeSchedule { targets: number[] }

export const timeEstimation: Scorer<TimeSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    return { targets: shuffle(r, TIME_TARGETS) };
  },
  minDurationMs: (s) => s.targets.reduce((a, b) => a + b, 0),
  score(s, payload) {
    const d = (payload as { durations?: unknown })?.durations;
    if (!Array.isArray(d) || d.length !== s.targets.length) return null;
    if (!d.every((x) => typeof x === "number" && Number.isFinite(x) && x >= 0 && x < 60000)) return null;
    const durations = d as number[];
    const errors = durations.map((x, i) => Math.abs(x - s.targets[i]));
    const meanErr = errors.reduce((a, b) => a + b, 0) / errors.length;
    const invalidReason = durations.some((x) => x < 200) ? "too_fast" : undefined; // pressing at once is not an estimate
    return {
      primary: Math.round(meanErr), // mean absolute error in ms; lower is better
      secondary: { underestimates: durations.filter((x, i) => x < s.targets[i]).length, trials: s.targets.length },
      valid: !invalidReason,
      invalidReason,
    };
  },
};

// ---- Cognitive reflection --------------------------------------------------------------------------------
export interface ReflectionItem { options: string[]; correct: number; trap: number }
// Well-known items (Frederick, 2005). The trap is the answer that comes to mind first.
export const REFLECTION_ITEMS: ReflectionItem[] = [
  { options: ["0.10", "0.05", "0.15", "0.01"], correct: 1, trap: 0 },   // bat and ball
  { options: ["100", "5", "20", "1"], correct: 1, trap: 0 },            // widgets
  { options: ["24", "47", "12", "36"], correct: 1, trap: 0 },           // lily pads
  { options: ["100", "3", "1", "33"], correct: 1, trap: 0 },            // cats and mice
  { options: ["8", "9", "17", "0"], correct: 1, trap: 0 },              // sheep
];

export const reflection: Scorer<{ items: number }> = {
  schedule: () => ({ items: REFLECTION_ITEMS.length }),
  minDurationMs: () => REFLECTION_ITEMS.length * 2000,
  publicView: () => ({ items: REFLECTION_ITEMS.map((x) => x.options) }), // the answers stay on the server
  score(_s, payload) {
    const a = (payload as { answers?: unknown })?.answers;
    if (!Array.isArray(a) || a.length !== REFLECTION_ITEMS.length) return null;
    if (!a.every((x) => Number.isInteger(x) && x >= -1 && x <= 3)) return null; // -1 = no answer
    let correct = 0, trapped = 0;
    REFLECTION_ITEMS.forEach((it, i) => {
      if (a[i] === it.correct) correct++;
      if (a[i] === it.trap) trapped++;
    });
    return { primary: correct, secondary: { trapped, items: REFLECTION_ITEMS.length }, valid: true }; // correct answers, higher is better
  },
};

export const SCORERS_LEARNING: Record<string, Scorer<any>> = {
  "card-sort": cardSort,
  "time-estimation": timeEstimation,
  "cognitive-reflection": reflection,
};
