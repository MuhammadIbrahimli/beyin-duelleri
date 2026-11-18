// Three tasks from public paradigms, written from their descriptions (no code copied):
//  - N-back (Kirchner, 1958; 2-back as used in working-memory research): say "yes" when the letter equals the one two steps back.
// Scores, thresholds and penalties are starter values (TODO(verify)), see config/points.ts and config/levels.ts.
import type { Scorer } from "./scoring";
import { randInt, rng, shuffle } from "./rng";
import { hasImpossibleReaction } from "./validity";

export const CHOICE_TRIALS = 24;
export const CHOICE_ERROR_PENALTY_MS = 1000; // added to the mean correct reaction for a 100% error rate
export const NBACK_LETTERS = 26;
const NBACK_LURE_SHARE = 0.3; // share of positions that really match two steps back

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
