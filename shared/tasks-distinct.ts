// Four tasks with mechanisms the app did not have yet (written from public paradigm descriptions, no code copied):
//  - Visual search (Treisman & Gelade, 1980): find the odd item among distractors; the search slope is the score's cost.
//  - Balloon risk task (BART, Lejuez et al., 2002): pump for points; each balloon may pop; keep what you collected.
//  - Matrix reasoning (Raven-style): find the missing cell in a 3x3 grid whose rules hold across rows and columns.
//  - Change detection (Luck & Vogel, 1997): remember coloured objects over a short delay; say if one changed.
// Scores, thresholds and penalties are starter values (TODO(verify)), see config/points.ts and config/levels.ts.
import type { Scorer } from "./scoring";
import { randInt, rng, shuffle } from "./rng";
import { finish, judge } from "./tasks-more";

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

// ---- Visual search ---------------------------------------------------------------------------------
export const SEARCH_TRIALS = 16;
export const SEARCH_SIZES = [8, 16];   // small and large display: the difference is the search cost
export interface SearchItem { cell: number; ch: "T" | "L"; rot: 0 | 90 | 180 | 270 }
export interface SearchTrial { size: number; items: SearchItem[]; present: boolean; cond: "base" | "cost" }
export interface SearchSchedule { trials: SearchTrial[] }

export const visualSearch: Scorer<SearchSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    const presentFlags = shuffle(r, [...Array(SEARCH_TRIALS / 2).fill(true), ...Array(SEARCH_TRIALS / 2).fill(false)] as boolean[]);
    const trials = presentFlags.map((present, i): SearchTrial => {
      const size = SEARCH_SIZES[i % 2];
      const cells = shuffle(r, Array.from({ length: 16 }, (_, k) => k)).slice(0, size);
      const rots: (0 | 90 | 180 | 270)[] = [0, 90, 180, 270];
      const items: SearchItem[] = cells.map((cell, k) => (present && k === 0
        ? { cell, ch: "T", rot: 0 }
        : { cell, ch: "L", rot: rots[randInt(r, 0, 3)] }));
      return { size, items, present, cond: size === SEARCH_SIZES[0] ? "base" : "cost" };
    });
    return { trials };
  },
  minDurationMs: (s) => s.trials.length * 900,
  publicView: (s) => ({ trials: s.trials.map((t) => ({ size: t.size, items: t.items, cond: t.cond })) }), // no answer
  score(s, payload) {
    const j = judge(s.trials.map((t) => ({ expected: t.present ? "yes" : "no", cond: t.cond })), payload, ["yes", "no"]);
    if (!j) return null;
    return finish(j, { searchSlopeMs: Math.round(mean(j.cost) - mean(j.base)) }); // extra time for the larger display
  },
};

// ---- Balloon risk task -------------------------------------------------------------------------------
export const BART_BALLOONS = 20;
export const BART_MAX_PUMPS = 32;
export const BART_POINTS_PER_PUMP = 5;
export interface BartSchedule { explode: number[] }   // the pump on which each balloon pops

export const bart: Scorer<BartSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    return { explode: Array.from({ length: BART_BALLOONS }, () => randInt(r, 1, BART_MAX_PUMPS)) };
  },
  minDurationMs: () => BART_BALLOONS * 600,
  // no publicView: the client gets the pop points, because it shows each pop as it happens (same trust level as Flanker and Go/No-Go)
  score(s, payload) {
    const pumps = (payload as { pumps?: unknown })?.pumps;
    if (!Array.isArray(pumps) || pumps.length !== BART_BALLOONS) return null;
    if (!pumps.every((p) => Number.isInteger(p) && p >= 0 && p <= BART_MAX_PUMPS)) return null;
    if (s.explode.some((ex, i) => (pumps[i] as number) > ex)) return null; // cannot pump past the pop
    let points = 0, popped = 0;
    s.explode.forEach((ex, i) => {
      const p = pumps[i] as number;
      // p > ex was rejected above
      if (p === ex) { popped++; return; } // popped on the last pump: nothing collected
      points += p * BART_POINTS_PER_PUMP;
    });
    return {
      primary: points, // collected points; higher is better
      secondary: { popped, balloons: BART_BALLOONS },
      valid: true,
    };
  },
};

// ---- Matrix reasoning ----------------------------------------------------------------------------------
export const MATRIX_PUZZLES = 8;
export interface MatrixCell { n: 1 | 2 | 3; shape: 0 | 1 | 2; colour: 0 | 1 | 2 }
export interface MatrixPuzzle { grid: (MatrixCell | null)[]; options: MatrixCell[]; answer: number }
export interface MatrixSchedule { puzzles: MatrixPuzzle[] }

/** Rule: count grows across each row (1,2,3); shape is fixed per row; colour is fixed per column. Missing cell is the last one. */
const cellAt = (row: number, col: number): MatrixCell => ({ n: (col + 1) as 1 | 2 | 3, shape: row as 0 | 1 | 2, colour: col as 0 | 1 | 2 });
const same = (a: MatrixCell, b: MatrixCell) => a.n === b.n && a.shape === b.shape && a.colour === b.colour;

export const matrix: Scorer<MatrixSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    const puzzles: MatrixPuzzle[] = [];
    for (let p = 0; p < MATRIX_PUZZLES; p++) {
      const grid: (MatrixCell | null)[] = [];
      for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) grid.push(cellAt(row, col));
      const correct = grid[8] as MatrixCell;
      grid[8] = null;
      // distractors change exactly one attribute of the right answer
      const distractors: MatrixCell[] = [
        { ...correct, n: (correct.n === 3 ? 2 : correct.n + 1) as 1 | 2 | 3 },
        { ...correct, shape: ((correct.shape + 1) % 3) as 0 | 1 | 2 },
        { ...correct, colour: ((correct.colour + 1) % 3) as 0 | 1 | 2 },
      ];
      const options = shuffle(r, [correct, ...distractors]);
      puzzles.push({ grid, options, answer: options.findIndex((o) => same(o, correct)) });
    }
    return { puzzles };
  },
  minDurationMs: () => MATRIX_PUZZLES * 1500,
  publicView: (s) => ({ puzzles: s.puzzles.map((p) => ({ grid: p.grid, options: p.options })) }), // no answer: no feedback is shown
  score(s, payload) {
    const choices = (payload as { choices?: unknown })?.choices;
    if (!Array.isArray(choices) || choices.length !== MATRIX_PUZZLES) return null;
    if (!choices.every((c) => Number.isInteger(c) && c >= -1 && c <= 3)) return null; // -1 = time ran out
    const correct = s.puzzles.filter((p, i) => choices[i] === p.answer).length;
    return { primary: correct, secondary: { puzzles: MATRIX_PUZZLES }, valid: true }; // puzzles solved, higher is better
  },
};

// ---- Change detection -----------------------------------------------------------------------------------
export const CHANGE_TRIALS = 16;
export const CHANGE_SIZES = [3, 5];   // set sizes; the difference is the capacity limit
export const COLOURS = ["red", "blue", "green", "yellow"] as const;
export interface Square { x: number; y: number; colour: (typeof COLOURS)[number] }
export interface ChangeTrial { size: number; set: Square[]; probe: Square[]; same: boolean; cond: "base" | "cost" }
export interface ChangeSchedule { trials: ChangeTrial[] }

export const changeDetection: Scorer<ChangeSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    const sames = shuffle(r, [...Array(CHANGE_TRIALS / 2).fill(true), ...Array(CHANGE_TRIALS / 2).fill(false)] as boolean[]);
    const trials = sames.map((same, i): ChangeTrial => {
      const size = CHANGE_SIZES[i % 2];
      const cells = shuffle(r, Array.from({ length: 12 }, (_, k) => k)).slice(0, size); // 4x3 grid
      const set: Square[] = cells.map((c) => ({ x: c % 4, y: Math.floor(c / 4), colour: COLOURS[randInt(r, 0, 3)] }));
      const probe: Square[] = set.map((s) => ({ ...s }));
      if (!same) {
        const k = randInt(r, 0, size - 1);
        const others = COLOURS.filter((c) => c !== set[k].colour);
        probe[k] = { ...probe[k], colour: others[randInt(r, 0, others.length - 1)] };
      }
      return { size, set, probe, same, cond: size === CHANGE_SIZES[0] ? "base" : "cost" };
    });
    return { trials };
  },
  minDurationMs: (s) => s.trials.length * 1600,
  publicView: (s) => ({ trials: s.trials.map((t) => ({ size: t.size, set: t.set, probe: t.probe, cond: t.cond })) }), // no answer
  score(s, payload) {
    const j = judge(s.trials.map((t) => ({ expected: t.same ? "yes" : "no", cond: t.cond })), payload, ["yes", "no"]);
    if (!j) return null;
    const correct = s.trials.length - j.errors;
    return { primary: Math.round((correct / s.trials.length) * 100), secondary: { errors: j.errors, trials: s.trials.length }, valid: true }; // percent correct, higher is better
  },
};

export const SCORERS_DISTINCT: Record<string, Scorer<any>> = {
  "visual-search": visualSearch,
  bart,
  matrix,
  "change-detection": changeDetection,
};
