// Four more tasks, written from public paradigm descriptions (no code copied):
//  - Tower of Hanoi (Simon, 1975 on planning): move all disks to the last peg; fewer extra moves is better.
//  - SART (Robertson et al., 1997): tap on every digit except 3; errors on 3 (commission) and misses (omission).
//  - Navon (1977): a large letter made of small letters; the global letter and the local letters may agree or not.
//  - Backward digit span (Wechsler): type the digits in reverse order; the longest correct length is the score.
// Scores, thresholds and penalties are starter values (TODO(verify)), see config/points.ts and config/levels.ts.
import type { Scorer } from "./scoring";
import { randInt, rng, shuffle } from "./rng";
import { finish, judge } from "./tasks-more";

// ---- Tower of Hanoi --------------------------------------------------------------------------------
export const HANOI_SIZES = [3, 4];          // two puzzles: 3 disks (7 moves) and 4 disks (15 moves)
export const HANOI_MAX_MOVES = 80;          // per puzzle; running out counts as unsolved
const HANOI_UNSOLVED_PENALTY = 20;          // extra moves charged for an unsolved puzzle
export interface HanoiSchedule { sizes: number[] }
export type Move = [number, number];

/** Replays the moves on the peg model. Returns null for an illegal move (the client never sends one). */
export function replayHanoi(n: number, moves: Move[]): { solved: boolean } | null {
  const pegs: number[][] = [Array.from({ length: n }, (_, i) => n - i), [], []]; // top of a peg = last element
  for (const [from, to] of moves) {
    if (![0, 1, 2].includes(from) || ![0, 1, 2].includes(to) || from === to) return null;
    const disk = pegs[from].pop();
    if (disk === undefined) return null;
    const top = pegs[to][pegs[to].length - 1];
    if (top !== undefined && top < disk) return null;
    pegs[to].push(disk);
  }
  return { solved: pegs[2].length === n };
}

export const hanoi: Scorer<HanoiSchedule> = {
  schedule: () => ({ sizes: HANOI_SIZES }),
  minDurationMs: () => 4000,
  score(s, payload) {
    const p = payload as { puzzles?: unknown };
    if (!Array.isArray(p?.puzzles) || p.puzzles.length !== s.sizes.length) return null;
    let extra = 0, solvedCount = 0, totalMoves = 0;
    for (let i = 0; i < s.sizes.length; i++) {
      const moves = p.puzzles[i] as Move[];
      if (!Array.isArray(moves) || moves.length > HANOI_MAX_MOVES) return null;
      const res = replayHanoi(s.sizes[i], moves);
      if (!res) return null;
      const optimal = 2 ** s.sizes[i] - 1;
      totalMoves += moves.length;
      if (res.solved) { solvedCount++; extra += moves.length - optimal; }
      else extra += HANOI_UNSOLVED_PENALTY;
    }
    return {
      primary: extra, // extra moves beyond the optimum (plus a penalty per unsolved puzzle); lower is better
      secondary: { solved: solvedCount, moves: totalMoves },
      valid: true,
    };
  },
};

// ---- SART -------------------------------------------------------------------------------------------
export const SART_TRIALS = 60;
export const SART_NOGO = 3;
export interface SartSchedule { digits: number[] }

export const sart: Scorer<SartSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    const others = [1, 2, 4, 5, 6, 7, 8, 9];
    return { digits: Array.from({ length: SART_TRIALS }, () => (r() < 0.11 ? SART_NOGO : others[randInt(r, 0, others.length - 1)])) };
  },
  minDurationMs: (s) => s.digits.length * 800,
  score(s, payload) {
    const taps = (payload as { taps?: unknown })?.taps;
    if (!Array.isArray(taps) || taps.length !== s.digits.length || !taps.every((x) => typeof x === "boolean")) return null;
    let commissions = 0, omissions = 0;
    s.digits.forEach((d, i) => {
      const tapped = taps[i] as boolean;
      if (d === SART_NOGO && tapped) commissions++;
      if (d !== SART_NOGO && !tapped) omissions++;
    });
    const goes = s.digits.filter((d) => d !== SART_NOGO).length;
    const errorRate = Math.round(((commissions + omissions) / s.digits.length) * 100);
    const tappedShare = taps.filter(Boolean).length / taps.length;
    const invalidReason = tappedShare > 0.95 ? "tapping_everything" : tappedShare < 0.05 ? "no_response" : undefined;
    return {
      primary: errorRate, // percent of trials with an error; lower is better
      secondary: { commissions, omissions, goTrials: goes },
      valid: !invalidReason,
      invalidReason,
    };
  },
};

// ---- Navon ------------------------------------------------------------------------------------------
// 5x5 bitmaps of the two letters. Big letter = pattern of small letters.
export const NAVON_PATTERNS: Record<"H" | "S", boolean[][]> = {
  H: [
    [true, false, false, false, true],
    [true, false, false, false, true],
    [true, true, true, true, true],
    [true, false, false, false, true],
    [true, false, false, false, true],
  ],
  S: [
    [false, true, true, true, true],
    [true, false, false, false, false],
    [false, true, true, true, false],
    [false, false, false, false, true],
    [true, true, true, true, false],
  ],
};
export const NAVON_TRIALS = 24;
export interface NavonTrial { expected: "H" | "S"; local: "H" | "S"; cond: "base" | "cost" }
export interface NavonSchedule { trials: NavonTrial[] }

export const navon: Scorer<NavonSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    const flags = shuffle(r, [...Array(NAVON_TRIALS / 2).fill(true), ...Array(NAVON_TRIALS / 2).fill(false)] as boolean[]);
    const trials = flags.map((congruent): NavonTrial => {
      const expected: "H" | "S" = r() < 0.5 ? "H" : "S";
      const other = expected === "H" ? "S" : "H";
      return { expected, local: congruent ? expected : other, cond: congruent ? "base" : "cost" };
    });
    return { trials };
  },
  minDurationMs: (s) => s.trials.length * 500,
  score(s, payload) {
    const j = judge(s.trials.map((t) => ({ expected: t.expected, cond: t.cond })), payload, ["H", "S"]);
    if (!j) return null;
    const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    return finish(j, { interferenceMs: Math.round(mean(j.cost) - mean(j.base)) }); // global-local conflict cost
  },
};

// ---- Backward digit span ----------------------------------------------------------------------------
export const DB_LENGTHS = [3, 4, 5, 6, 7, 8];
export interface DigitBackwardSchedule { seqs: number[][] }

export const digitBackward: Scorer<DigitBackwardSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    return {
      seqs: DB_LENGTHS.map((n) => {
        const seq: number[] = [];
        for (let i = 0; i < n; i++) {
          let d: number;
          do d = randInt(r, 1, 9); while (seq.length && d === seq[seq.length - 1]); // no immediate repeats
          seq.push(d);
        }
        return seq;
      }),
    };
  },
  minDurationMs: (s) => s.seqs.reduce((a, q) => a + q.length * 900, 0),
  score(s, payload) {
    const answers = (payload as { answers?: unknown })?.answers;
    if (!Array.isArray(answers) || answers.length !== s.seqs.length) return null;
    if (!answers.every((a) => Array.isArray(a) && a.length <= 8 && a.every((d) => Number.isInteger(d) && d >= 1 && d <= 9))) return null;
    let longest = 0, correct = 0;
    s.seqs.forEach((seq, i) => {
      const want = [...seq].reverse();
      const got = answers[i] as number[];
      if (got.length === want.length && got.every((d, k) => d === want[k])) {
        correct++;
        longest = Math.max(longest, seq.length);
      }
    });
    return { primary: longest, secondary: { correct, trials: s.seqs.length }, valid: true }; // longest correct length, higher is better
  },
};

export const SCORERS_NEXT: Record<string, Scorer<any>> = {
  hanoi,
  sart,
  navon,
  "digit-backward": digitBackward,
};
