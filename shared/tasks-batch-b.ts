// Nine tasks with mechanisms the app does not have yet (written from public paradigm descriptions, no code copied):
//  - Dual task (Pashler, 1994): remember digits while catching a rare red flash; the score combines both.
//  - Selective listening (dichotic listening, Cherry, 1953): count the beeps in the attended ear and ignore the other.
//  - Vigilance clock (Mackworth, 1948): spot the rare double jump of a pointer over a long period.
//  - Rhythm synchronisation: tap in time with a flashing beat; the score is the mean timing error.
//  - Name matching (Posner & Mitchell, 1967): are two letters the same letter (case may differ)?
//  - Choice reaction time (Hick, 1952): respond to a colour with one of two keys; no conflict between stimulus and key.
//  - Motor sequence: repeat a pattern of key presses from memory, as quickly as possible.
//  - Visual cancellation: find and mark every target letter in a grid of letters.
//  - Motor tracing: draw along a path without leaving it.
// Scores, thresholds and penalties are starter values (TODO(verify)), see config/points.ts and config/levels.ts.
import type { Scorer } from "./scoring";
import { randInt, rng, shuffle } from "./rng";
import { finish, judge } from "./tasks-more";

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

// ---- Dual task -----------------------------------------------------------------------------------------
export const DUAL_TRIALS = 3;
export interface DualTrial { digits: number[]; flashes: number[] }
export interface DualSchedule { trials: DualTrial[] }

export const dual: Scorer<DualSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    return {
      trials: Array.from({ length: DUAL_TRIALS }, (): DualTrial => ({
        digits: Array.from({ length: 4 }, () => randInt(r, 1, 9)),
        flashes: shuffle(r, [0, 1, 2, 3, 4, 5, 6, 7]).slice(0, 2).sort((a, b) => a - b),
      })),
    };
  },
  minDurationMs: () => DUAL_TRIALS * 7000,
  publicView: (s) => ({ trials: s.trials.map((t) => ({ digits: t.digits, flashes: t.flashes })) }),
  score(s, payload) {
    const p = payload as { digits?: unknown; caught?: unknown };
    if (!Array.isArray(p?.digits) || !Array.isArray(p?.caught)) return null;
    const digitsIn = p.digits as unknown[];
    const caughtIn = p.caught as unknown[];
    if (digitsIn.length !== DUAL_TRIALS || caughtIn.length !== DUAL_TRIALS) return null;
    if (!digitsIn.every((d) => Array.isArray(d) && d.length <= 4 && d.every((x) => Number.isInteger(x) && x >= 1 && x <= 9))) return null;
    if (!caughtIn.every((c) => Number.isInteger(c) && (c as number) >= 0 && (c as number) <= 2)) return null;
    let digitHits = 0, caught = 0;
    s.trials.forEach((t, i) => {
      const got = digitsIn[i] as number[];
      t.digits.forEach((d, k) => { if (got[k] === d) digitHits++; });
      caught += Math.min(2, caughtIn[i] as number);
    });
    const digitPct = digitHits / (DUAL_TRIALS * 4);
    const flashPct = caught / (DUAL_TRIALS * 2);
    return { primary: Math.round(((digitPct + flashPct) / 2) * 100), secondary: { digitHits, caught }, valid: true };
  },
};

// ---- Selective listening -------------------------------------------------------------------------------------
export const LISTEN_TRIALS = 3;
export interface ListenTrial { left: number; right: number }
export interface ListenSchedule { trials: ListenTrial[] }

export const listening: Scorer<ListenSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    return { trials: Array.from({ length: LISTEN_TRIALS }, () => ({ left: randInt(r, 3, 6), right: randInt(r, 3, 6) })) };
  },
  minDurationMs: (s) => s.trials.length * 6000,
  publicView: (s) => ({ trials: s.trials.map((t) => ({ left: t.left, right: t.right })) }),
  score(s, payload) {
    const answers = (payload as { answers?: unknown })?.answers;
    if (!Array.isArray(answers) || answers.length !== LISTEN_TRIALS) return null;
    if (!answers.every((a) => Number.isInteger(a) && a >= 0 && a <= 20)) return null;
    const correct = s.trials.filter((t, i) => answers[i] === t.left).length;
    return { primary: Math.round((correct / LISTEN_TRIALS) * 100), secondary: { trials: LISTEN_TRIALS }, valid: true };
  },
};

// ---- Vigilance clock ------------------------------------------------------------------------------------------
export const CLOCK_STEPS = 40;
export const CLOCK_JUMPS = 4;
export interface ClockSchedule { jumps: number[] }

export const vigilance: Scorer<ClockSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    // double jumps are rare and never at the very start or end
    const jumps = shuffle(r, Array.from({ length: CLOCK_STEPS - 6 }, (_, i) => i + 3)).slice(0, CLOCK_JUMPS).sort((a, b) => a - b);
    return { jumps };
  },
  minDurationMs: () => CLOCK_STEPS * 900,
  score(s, payload) {
    const taps = (payload as { taps?: unknown })?.taps;
    if (!Array.isArray(taps) || taps.length > CLOCK_STEPS) return null;
    if (!taps.every((t) => Number.isInteger(t) && t >= 0 && t < CLOCK_STEPS)) return null;
    const inWindow = (t: number) => s.jumps.some((j) => t === j || t === j + 1); // the pointer has two steps to be caught
    const hits = s.jumps.filter((j) => (taps as number[]).some((t) => t === j || t === j + 1)).length;
    const falseAlarms = (taps as number[]).filter((t) => !inWindow(t)).length;
    const score = Math.max(0, Math.min(100, Math.round(((hits - falseAlarms * 0.5) / s.jumps.length) * 100)));
    return { primary: score, secondary: { hits, falseAlarms, jumps: s.jumps.length }, valid: true };
  },
};

// ---- Rhythm synchronisation ------------------------------------------------------------------------------------
export const RHYTHM_BEATS = 12;
export const RHYTHM_MS = 600;
export interface RhythmSchedule { beats: number; intervalMs: number }

export const rhythm: Scorer<RhythmSchedule> = {
  schedule: () => ({ beats: RHYTHM_BEATS, intervalMs: RHYTHM_MS }),
  minDurationMs: () => RHYTHM_BEATS * RHYTHM_MS,
  score(s, payload) {
    const taps = (payload as { taps?: unknown })?.taps;
    if (!Array.isArray(taps) || taps.length > 60) return null;
    if (!taps.every((x) => typeof x === "number" && Number.isFinite(x) && x >= 0 && x < 60000)) return null;
    const ts = (taps as number[]).slice().sort((a, b) => a - b);
    const errors: number[] = [];
    for (let k = 0; k < s.beats; k++) {
      const beat = (k + 1) * s.intervalMs;
      // the tap closest to this beat within half an interval; a missing tap costs a fixed penalty
      const near = ts.filter((t) => Math.abs(t - beat) < s.intervalMs / 2);
      errors.push(near.length ? Math.min(...near.map((t) => Math.abs(t - beat))) : s.intervalMs / 2);
    }
    const meanErr = Math.round(mean(errors));
    return { primary: meanErr, secondary: { missed: errors.filter((e) => e === s.intervalMs / 2).length, beats: s.beats }, valid: true }; // mean timing error in ms, lower is better
  },
};

// ---- Name matching ------------------------------------------------------------------------------------------------
export const NAME_TRIALS = 24;
const LETTERS = ["A", "B", "D", "E", "F", "G", "H", "K", "M", "N", "P", "R", "S", "T"];
export interface NameTrial { a: string; b: string; same: boolean; cond: "base" | "cost" }
export interface NameSchedule { trials: NameTrial[] }

export const nameMatch: Scorer<NameSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    const flags = shuffle(r, [...Array(NAME_TRIALS / 2).fill(true), ...Array(NAME_TRIALS / 2).fill(false)] as boolean[]);
    return {
      trials: flags.map((same): NameTrial => {
        const a = LETTERS[randInt(r, 0, LETTERS.length - 1)];
        if (!same) {
          let b = a;
          while (b === a) b = LETTERS[randInt(r, 0, LETTERS.length - 1)];
          return { a, b, same: false, cond: "base" };
        }
        // same letter: identical shapes (base) or different case (cost)
        const lower = r() < 0.5;
        return { a, b: lower ? a.toLowerCase() : a, same: true, cond: lower ? "cost" : "base" };
      }),
    };
  },
  minDurationMs: (s) => s.trials.length * 500,
  publicView: (s) => ({ trials: s.trials.map((t) => ({ a: t.a, b: t.b })) }),
  score(s, payload) {
    const j = judge(s.trials.map((t) => ({ expected: t.same ? "yes" : "no", cond: t.cond })), payload, ["yes", "no"]);
    if (!j) return null;
    return finish(j, { caseCostMs: Math.round(mean(j.cost) - mean(j.base)) });
  },
};

// ---- Choice reaction time ---------------------------------------------------------------------------------------
export const CHOICE_RT_TRIALS = 24;
export interface ChoiceRtSchedule { trials: { colour: "red" | "blue"; expected: "left" | "right" }[] }

export const choiceRt: Scorer<ChoiceRtSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    return {
      trials: Array.from({ length: CHOICE_RT_TRIALS }, () => {
        const colour = r() < 0.5 ? "red" : "blue";
        return { colour, expected: colour === "red" ? "left" : "right" } as const;
      }).map((t) => ({ colour: t.colour, expected: t.expected })),
    };
  },
  minDurationMs: (s) => s.trials.length * 400,
  publicView: (s) => ({ trials: s.trials.map((t) => ({ colour: t.colour })) }),
  score(s, payload) {
    const j = judge(s.trials.map((t) => ({ expected: t.expected })), payload, ["left", "right"]);
    if (!j) return null;
    return finish(j);
  },
};

// ---- Motor sequence -------------------------------------------------------------------------------------------------
export const MOTOR_SEQS = [5, 6, 7];
export interface MotorSchedule { seqs: number[][] }

export const motorSeq: Scorer<MotorSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    return {
      seqs: MOTOR_SEQS.map((n) => {
        const seq: number[] = [];
        while (seq.length < n) { const p = randInt(r, 0, 3); if (seq[seq.length - 1] !== p) seq.push(p); }
        return seq;
      }),
    };
  },
  minDurationMs: (s) => s.seqs.length * 2000,
  publicView: (s) => ({ lengths: s.seqs.map((q) => q.length), seqs: s.seqs }),
  score(s, payload) {
    const p = payload as { answers?: unknown; times?: unknown };
    if (!Array.isArray(p?.answers) || !Array.isArray(p?.times)) return null;
    if (p.answers.length !== s.seqs.length || p.times.length !== s.seqs.length) return null;
    const answersIn = p.answers as unknown[];
    if (!answersIn.every((a) => Array.isArray(a) && a.length <= 10 && a.every((x) => Number.isInteger(x) && x >= 0 && x <= 3))) return null;
    if (!p.times.every((x) => typeof x === "number" && Number.isFinite(x) && x >= 0 && x < 60000)) return null;
    const ok: number[] = [];
    let wrong = 0;
    s.seqs.forEach((seq, i) => {
      const a = answersIn[i] as number[];
      if (a.length === seq.length && a.every((x, k) => x === seq[k])) ok.push((p.times as number[])[i]);
      else wrong++;
    });
    const primary = Math.round((ok.length ? mean(ok) : 60000) + 1000 * wrong);
    return { primary, secondary: { correct: ok.length, wrong }, valid: ok.length > 0, invalidReason: ok.length ? undefined : "no_hits" }; // ms per sequence plus penalty; lower is better
  },
};

// ---- Visual cancellation -----------------------------------------------------------------------------------------------
export const CANCEL_CELLS = 60;
export const CANCEL_TARGET = "E";
export interface CancelSchedule { grid: string[] }

export const cancellation: Scorer<CancelSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    const others = ["A", "B", "D", "F", "G", "H", "K", "M", "N", "P", "R", "S", "T"];
    const grid = Array.from({ length: CANCEL_CELLS }, () => others[randInt(r, 0, others.length - 1)]);
    const targets = shuffle(r, Array.from({ length: CANCEL_CELLS }, (_, i) => i)).slice(0, 8);
    for (const t of targets) grid[t] = CANCEL_TARGET;
    return { grid };
  },
  minDurationMs: () => 10000,
  publicView: (s) => ({ grid: s.grid }),
  score(s, payload) {
    const taps = (payload as { taps?: unknown })?.taps;
    if (!Array.isArray(taps) || taps.length > CANCEL_CELLS) return null;
    if (!taps.every((t) => Number.isInteger(t) && t >= 0 && t < CANCEL_CELLS)) return null;
    if (new Set(taps).size !== taps.length) return null;
    const hits = (taps as number[]).filter((t) => s.grid[t] === CANCEL_TARGET).length;
    const errors = taps.length - hits;
    const total = s.grid.filter((c) => c === CANCEL_TARGET).length;
    return { primary: Math.max(0, hits - errors), secondary: { hits, errors, total }, valid: true }; // correct marks minus wrong ones, higher is better
  },
};

// ---- Motor tracing --------------------------------------------------------------------------------------------------
export const TRACE_PATHS = 3;
export const TRACE_POINTS = 6;
export interface TraceSchedule { paths: [number, number][][] }

const segDist = (p: [number, number], a: [number, number], b: [number, number]) => {
  const [px, py] = p, [ax, ay] = a, [bx, by] = b;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

export const tracing: Scorer<TraceSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    return {
      paths: Array.from({ length: TRACE_PATHS }, () => Array.from({ length: TRACE_POINTS }, (_, i) => [
        Math.round(8 + (84 * i) / (TRACE_POINTS - 1)),
        Math.round(15 + r() * 70),
      ] as [number, number])),
    };
  },
  minDurationMs: () => TRACE_PATHS * 2000,
  publicView: (s) => ({ paths: s.paths }),
  score(s, payload) {
    const traces = (payload as { traces?: unknown })?.traces;
    if (!Array.isArray(traces) || traces.length !== TRACE_PATHS) return null;
    if (!traces.every((t) => Array.isArray(t) && t.length <= 400 && t.every((p) => Array.isArray(p) && p.length === 2 && p.every((x) => typeof x === "number" && x >= -10 && x <= 110)))) return null;
    let covered = 0, total = 0, dev = 0, devN = 0;
    s.paths.forEach((path, i) => {
      const tr = traces[i] as [number, number][];
      // coverage: sample the path every 2 units, a sample counts when a trace point is within 5 units
      for (let k = 0; k < path.length - 1; k++) {
        for (let u = 0; u <= 10; u++) {
          const f = u / 10;
          const q: [number, number] = [path[k][0] + (path[k + 1][0] - path[k][0]) * f, path[k][1] + (path[k + 1][1] - path[k][1]) * f];
          total++;
          if (tr.some((p) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= 5)) covered++;
        }
      }
      for (const p of tr) {
        let best = Infinity;
        for (let k = 0; k < path.length - 1; k++) best = Math.min(best, segDist(p, path[k], path[k + 1]));
        dev += best; devN++;
      }
    });
    return {
      primary: Math.round((covered / total) * 100), // percent of the path covered by the trace, higher is better
      secondary: { meanDeviation: devN ? Math.round((dev / devN) * 10) / 10 : 0 },
      valid: true,
    };
  },
};

export const SCORERS_BATCH_B: Record<string, Scorer<any>> = {
  "dual-task": dual,
  "selective-listening": listening,
  "vigilance-clock": vigilance,
  "rhythm-sync": rhythm,
  "name-matching": nameMatch,
  "choice-reaction": choiceRt,
  "motor-sequence": motorSeq,
  cancellation,
  tracing,
};
