// Six tasks with mechanisms the app does not have yet (written from public paradigm descriptions, no code copied):
//  - Serial reaction time (Nissen & Bullemer, 1987): a hidden repeating sequence makes responses faster, without the player noticing it.
//  - Object-location memory: remember where objects were placed on a grid, then find the location of one of them.
//  - Paired associates (Underwood, 1960s): learn pairs (digit and symbol), then recall the partner of a cue.
//  - Temporal order memory: remember which of two items came first in a sequence.
//  - Wason selection task (Wason, 1966): test a rule by choosing the cards that could falsify it.
//  - Odd-one-out (categorisation): find the item that does not share the common attribute.
// Scores, thresholds and penalties are starter values (TODO(verify)), see config/points.ts and config/levels.ts.
import type { Scorer } from "./scoring";
import { randInt, rng, shuffle } from "./rng";

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
export const SYMBOLS6 = ["■", "▲", "✚", "◆", "★", "●"];

// ---- Serial reaction time ---------------------------------------------------------------------------------
export const SRT_BLOCKS = 6;      // blocks 0-2 and 4-5 follow the hidden sequence, block 3 is random
export const SRT_BLOCK_LEN = 8;
export interface SrtSchedule { items: number[]; kinds: ("seq" | "rand")[] }

export const srt: Scorer<SrtSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    // a 6-long sequence over four positions, no position twice in a row
    const seq: number[] = [];
    while (seq.length < 6) { const p = randInt(r, 0, 3); if (seq[seq.length - 1] !== p) seq.push(p); }
    const items: number[] = [], kinds: ("seq" | "rand")[] = [];
    let j = 0;
    for (let b = 0; b < SRT_BLOCKS; b++) {
      const random = b === 3;
      for (let k = 0; k < SRT_BLOCK_LEN; k++) {
        if (random) items.push(randInt(r, 0, 3));
        else { items.push(seq[j % 6]); j++; }
        kinds.push(random ? "rand" : "seq");
      }
    }
    return { items, kinds };
  },
  minDurationMs: (s) => s.items.length * 500,
  publicView: (s) => ({ items: s.items, kinds: s.kinds }),
  score(s, payload): ReturnType<Scorer["score"]> {
    const p = payload as { choices?: unknown; times?: unknown };
    if (!Array.isArray(p?.choices) || !Array.isArray(p?.times)) return null;
    if (p.choices.length !== s.items.length || p.times.length !== s.items.length) return null;
    if (!p.choices.every((c) => Number.isInteger(c) && c >= 0 && c <= 3)) return null;
    if (!p.times.every((x) => typeof x === "number" && Number.isFinite(x) && x >= 0 && x < 5000)) return null;
    const times = p.times as number[];
    const rand: number[] = [], seqLate: number[] = [];
    s.items.forEach((it, i) => {
      if ((p.choices as number[])[i] !== it) return;
      if (s.kinds[i] === "rand") rand.push(times[i]);
      else if (i >= SRT_BLOCK_LEN * 4) seqLate.push(times[i]); // the last two sequence blocks
    });
    if (rand.length === 0 || seqLate.length === 0) return { primary: 0, secondary: { correctRand: rand.length }, valid: false, invalidReason: "no_hits" };
    return {
      primary: Math.round(mean(rand) - mean(seqLate)), // ms saved by the hidden sequence; higher means more learning
      secondary: { randomMs: Math.round(mean(rand)), sequenceMs: Math.round(mean(seqLate)) },
      valid: true,
    };
  },
};

// ---- Object-location memory --------------------------------------------------------------------------------
export const LOC_SIZES = [2, 2, 3, 3, 4, 5];
export interface LocTrial { shown: number[]; probe: number; shapes: number[] }
export interface LocSchedule { trials: LocTrial[] }

export const location: Scorer<LocSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    return {
      trials: LOC_SIZES.map((n) => {
        const shown = shuffle(r, Array.from({ length: 12 }, (_, i) => i)).slice(0, n);
        // distinct shapes in one trial, so that "where was the ▲?" has one answer
        return { shown, probe: randInt(r, 0, n - 1), shapes: shuffle(r, [0, 1, 2, 3, 4, 5]).slice(0, n) };
      }),
    };
  },
  minDurationMs: (s) => s.trials.length * 3000,
  publicView: (s) => ({ trials: s.trials.map((t) => ({ shown: t.shown, shapes: t.shapes, probe: t.probe })) }), // which object is asked about; the cell is what the player must remember
  score(s, payload) {
    const cells = (payload as { cells?: unknown })?.cells;
    if (!Array.isArray(cells) || cells.length !== s.trials.length) return null;
    if (!cells.every((c) => Number.isInteger(c) && c >= 0 && c <= 11)) return null;
    const correct = s.trials.filter((t, i) => cells[i] === t.shown[t.probe]).length;
    return { primary: Math.round((correct / s.trials.length) * 100), secondary: { trials: s.trials.length }, valid: true };
  },
};

// ---- Paired associates -------------------------------------------------------------------------------------
export interface PairSchedule { pairs: { digit: number; shape: number }[]; order: number[] }

export const paired: Scorer<PairSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    const shapes = shuffle(r, [0, 1, 2, 3, 4, 5]);
    const pairs = [1, 2, 3, 4, 5, 6].map((d, i) => ({ digit: d, shape: shapes[i] }));
    return { pairs, order: shuffle(r, [0, 1, 2, 3, 4, 5]) };
  },
  minDurationMs: () => 6 * 1500 + 6 * 1000,
  publicView: (s) => ({ pairs: s.pairs, order: s.order }),
  score(s, payload) {
    const choices = (payload as { choices?: unknown })?.choices;
    if (!Array.isArray(choices) || choices.length !== 6) return null;
    if (!choices.every((c) => Number.isInteger(c) && c >= 0 && c <= 5)) return null;
    const correct = s.order.filter((pi, k) => choices[k] === s.pairs[pi].shape).length;
    return { primary: Math.round((correct / 6) * 100), secondary: { correct }, valid: true };
  },
};

// ---- Temporal order memory ----------------------------------------------------------------------------------
export const TEMPORAL_TRIALS = 8;
export interface TemporalTrial { seq: number[]; pair: [number, number]; firstIsA: boolean }
export interface TemporalSchedule { trials: TemporalTrial[] }

export const temporal: Scorer<TemporalSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    return {
      trials: Array.from({ length: TEMPORAL_TRIALS }, (): TemporalTrial => {
        const seq = shuffle(r, [0, 1, 2, 3]).slice(0, 3);
        const [a, b] = shuffle(r, seq);       // a pair of the three shapes, in random order on screen
        // "first" is the one that came earlier in the sequence
        const firstIsA = seq.indexOf(a) < seq.indexOf(b);
        return { seq, pair: [a, b], firstIsA };
      }),
    };
  },
  minDurationMs: (s) => s.trials.length * 3000,
  publicView: (s) => ({ trials: s.trials.map((t) => ({ seq: t.seq, pair: t.pair })) }),
  score(s, payload) {
    const choices = (payload as { choices?: unknown })?.choices;
    if (!Array.isArray(choices) || choices.length !== s.trials.length) return null;
    if (!choices.every((c) => c === 0 || c === 1)) return null;
    const correct = s.trials.filter((t, i) => (choices[i] === 0) === t.firstIsA).length;
    return { primary: Math.round((correct / s.trials.length) * 100), secondary: { trials: s.trials.length }, valid: true };
  },
};

// ---- Wason selection ----------------------------------------------------------------------------------------
// Rule "if P then Q". The cards show P, not-P, Q and not-Q. The right choice is P and not-Q: those could falsify the rule.
export const WASON: { rule: [number, number]; cards: number[]; correct: number[] }[] = [
  { rule: [5, 0], cards: [5, 2, 0, 3], correct: [0, 3] },   // if ● then ■ : cards ●, ✚, ■, ◆
  { rule: [1, 3], cards: [1, 0, 3, 2], correct: [0, 3] },   // if ▲ then ◆ : cards ▲, ■, ◆, ✚ (P and not-Q)
  { rule: [4, 5], cards: [4, 3, 5, 2], correct: [0, 3] },   // if ★ then ● : cards ★, ◆, ●, ✚ (P and not-Q)
];

export const wason: Scorer<{ items: number }> = {
  schedule: () => ({ items: WASON.length }),
  minDurationMs: () => WASON.length * 4000,
  publicView: () => ({ cards: WASON.map((w) => w.cards), rules: WASON.map((w) => w.rule) }),
  score(_s, payload) {
    const picks = (payload as { picks?: unknown })?.picks;
    if (!Array.isArray(picks) || picks.length !== WASON.length) return null;
    if (!picks.every((p) => Array.isArray(p) && p.every((i) => Number.isInteger(i) && i >= 0 && i <= 3))) return null;
    const exact = WASON.filter((w, i) => {
      const got = [...new Set(picks[i] as number[])].sort();
      return got.length === w.correct.length && got.every((x, k) => x === w.correct[k]);
    }).length;
    return { primary: exact, secondary: { items: WASON.length }, valid: true }; // trials answered exactly right, higher is better
  },
};

// ---- Odd one out --------------------------------------------------------------------------------------------
export const ODD_TRIALS = 6;
export interface OddItem { shape: number; colour: number; n: number }
export interface OddTrial { items: OddItem[]; odd: number }
export interface OddSchedule { trials: OddTrial[] }

export const oddOneOut: Scorer<OddSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    return {
      trials: Array.from({ length: ODD_TRIALS }, (): OddTrial => {
        const dim = (["shape", "colour", "n"] as const)[randInt(r, 0, 2)];
        const common = { shape: randInt(r, 0, 5), colour: randInt(r, 0, 2), n: randInt(r, 1, 3) };
        const odd = randInt(r, 0, 3);
        const items: OddItem[] = Array.from({ length: 4 }, (_, i) => {
          if (i !== odd) return { ...common };
          // the odd item has a different value on the chosen dimension; the others vary freely
          const it = { shape: randInt(r, 0, 5), colour: randInt(r, 0, 2), n: randInt(r, 1, 3) };
          if (dim === "shape") it.shape = (common.shape + 1 + randInt(r, 0, 4)) % 6;
          if (dim === "colour") it.colour = (common.colour + 1 + randInt(r, 0, 1)) % 3;
          if (dim === "n") it.n = common.n === 1 ? 2 : 1;
          return it;
        });
        // the other three must share the attribute with each other (they all equal `common` on the chosen dimension)
        return { items: items.map((it, i) => (i === odd ? it : { ...it, [dim]: (common as any)[dim] })), odd };
      }),
    };
  },
  minDurationMs: (s) => s.trials.length * 2000,
  publicView: (s) => ({ trials: s.trials.map((t) => ({ items: t.items })) }),
  score(s, payload) {
    const choices = (payload as { choices?: unknown })?.choices;
    if (!Array.isArray(choices) || choices.length !== s.trials.length) return null;
    if (!choices.every((c) => Number.isInteger(c) && c >= 0 && c <= 3)) return null;
    const correct = s.trials.filter((t, i) => choices[i] === t.odd).length;
    return { primary: Math.round((correct / s.trials.length) * 100), secondary: { trials: s.trials.length }, valid: true };
  },
};

export const SCORERS_BATCH_A: Record<string, Scorer<any>> = {
  "serial-reaction": srt,
  "object-location": location,
  "paired-associates": paired,
  "temporal-order-memory": temporal,
  wason,
  "odd-one-out": oddOneOut,
};
