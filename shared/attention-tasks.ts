// Three tasks from public paradigms, written from their descriptions (no code copied):
//  - Flanker (Eriksen & Eriksen, 1974): respond to the middle arrow while flanking arrows agree or disagree with it.
//  - Simon (Simon, 1969): respond to the colour of a dot whose side on screen is irrelevant (congruent when they match).
//  - N-back (Kirchner, 1958; 2-back as used in working-memory research): say "yes" when the letter equals the one two steps back.
// Scores, thresholds and penalties are starter values (TODO(verify)), see config/points.ts and config/levels.ts.
import type { Scorer } from "./scoring";
import { randInt, rng, shuffle } from "./rng";
import { hasImpossibleReaction } from "./validity";

export const CHOICE_TRIALS = 24;
export const CHOICE_ERROR_PENALTY_MS = 1000; // added to the mean correct reaction for a 100% error rate
export const NBACK_LETTERS = 26;
const NBACK_LURE_SHARE = 0.3; // share of positions that really match two steps back

// ---- Flanker and Simon: two-choice reaction tasks ----------------------------------------
export interface ChoiceTrial { expected: string; stim: string; congruent: boolean; gapMs: number }
export interface ChoiceSchedule { kind: "flanker" | "simon"; trials: ChoiceTrial[] }

function scoreChoice(s: ChoiceSchedule, payload: unknown): ReturnType<Scorer["score"]> {
  const p = payload as { choices?: unknown; times?: unknown };
  if (!Array.isArray(p?.choices) || !Array.isArray(p?.times)) return null;
  const choices = p.choices as (string | null)[], times = p.times as number[];
  if (choices.length !== s.trials.length || times.length !== s.trials.length) return null;
  if (!choices.every((c) => c === null || c === "left" || c === "right" || c === "red" || c === "blue")) return null;
  if (!times.every((x) => Number.isFinite(x) && x >= 0 && x < 5000)) return null;

  const correctRt: number[] = [];
  const cong: number[] = [], incong: number[] = [];
  let errors = 0;
  s.trials.forEach((tr, i) => {
    const c = choices[i];
    if (c === tr.expected) {
      correctRt.push(times[i]);
      (tr.congruent ? cong : incong).push(times[i]);
    } else errors++;
  });
  const errorRate = errors / s.trials.length;
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const meanCorrect = mean(correctRt);
  const invalidReason = hasImpossibleReaction(correctRt) ? "too_fast" : errorRate > 0.5 ? "guessing" : correctRt.length === 0 ? "no_hits" : undefined;
  return {
    primary: Math.round(meanCorrect + CHOICE_ERROR_PENALTY_MS * errorRate),
    secondary: {
      errors,
      congruentMs: Math.round(mean(cong)),
      incongruentMs: Math.round(mean(incong)),
      interference: Math.round(mean(incong) - mean(cong)), // the cost of conflict, in ms
    },
    valid: !invalidReason,
    invalidReason,
  };
}

/** Arrows for Flanker: the middle arrow is the answer; the flankers agree (congruent) or point the other way. */
const arrows = (expected: string, congruent: boolean) => {
  const c = expected === "left" ? "<" : ">";
  const o = c === "<" ? ">" : "<";
  return congruent ? c.repeat(5) : o + o + c + o + o;
};

const choiceSchedule = (kind: "flanker" | "simon") => (seed: number): ChoiceSchedule => {
  const r = rng(seed);
  const congruentFlags = shuffle(r, [...Array(CHOICE_TRIALS / 2).fill(true), ...Array(CHOICE_TRIALS / 2).fill(false)] as boolean[]);
  const trials: ChoiceTrial[] = congruentFlags.map((congruent) => {
    const side = r() < 0.5 ? "left" : "right";
    if (kind === "flanker") {
      const expected = side;
      return { expected, stim: arrows(expected, congruent), congruent, gapMs: randInt(r, 500, 800) };
    }
    // Simon: the dot appears on `side`; its colour is the instruction. Red belongs to the left button, blue to the right.
    const colourIfCongruent = side === "left" ? "red" : "blue";
    const expected = congruent ? colourIfCongruent : colourIfCongruent === "red" ? "blue" : "red";
    return { expected, stim: side, congruent, gapMs: randInt(r, 500, 800) };
  });
  return { kind, trials };
};

export const flanker: Scorer<ChoiceSchedule> = {
  schedule: choiceSchedule("flanker"),
  minDurationMs: (s) => s.trials.length * 400,
  score: (s, payload) => scoreChoice(s, payload),
};
export const simon: Scorer<ChoiceSchedule> = {
  schedule: choiceSchedule("simon"),
  minDurationMs: (s) => s.trials.length * 400,
  score: (s, payload) => scoreChoice(s, payload),
};

// ---- N-back (2-back) ----------------------------------------------------------------------
const LETTERS = ["B", "K", "M", "R", "T", "Z"]; // consonants that are easy to tell apart on screen
export interface NbackSchedule { letters: string[] }

/** A position is a target when it matches the letter two steps back. The client shows letters only. */
export const nbackTargets = (letters: string[]) => letters.map((l, i) => i >= 2 && l === letters[i - 2]);

export const nback: Scorer<NbackSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    const letters: string[] = [];
    for (let i = 0; i < NBACK_LETTERS; i++) {
      if (i >= 2 && r() < NBACK_LURE_SHARE) { letters.push(letters[i - 2]); continue; }
      const pool = LETTERS.filter((x) => i < 2 || x !== letters[i - 2]); // a non-target never repeats the letter two back
      letters.push(pool[randInt(r, 0, pool.length - 1)]);
    }
    return { letters };
  },
  minDurationMs: (s) => s.letters.length * 1200,
  score(s, payload) {
    const resp = (payload as { responses?: unknown })?.responses;
    if (!Array.isArray(resp) || resp.length !== s.letters.length || !resp.every((x) => typeof x === "boolean")) return null;
    const targets = nbackTargets(s.letters);
    let hits = 0, falseAlarms = 0, misses = 0, correct = 0, nonTargets = 0;
    targets.forEach((isTarget, i) => {
      const said = resp[i] as boolean;
      if (isTarget) { if (said) hits++; else misses++; } else { nonTargets++; if (said) falseAlarms++; }
      if (said === isTarget) correct++;
    });
    const accuracy = Math.round((correct / s.letters.length) * 100);
    const invalidReason = nonTargets > 0 && falseAlarms > nonTargets / 2 ? "tapping_everything" : undefined;
    return {
      primary: accuracy, // percent of positions answered correctly; higher is better
      secondary: { hits, falseAlarms, misses, targets: targets.filter(Boolean).length },
      valid: !invalidReason,
      invalidReason,
    };
  },
};
