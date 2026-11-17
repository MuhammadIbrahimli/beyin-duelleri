import { randInt, rng, shuffle } from "./rng";
import { median } from "./stats";
import { hasIdenticalTimes, hasImpossibleReaction } from "./validity";

export interface ScoreResult {
  primary: number;
  secondary: Record<string, number>;
  valid: boolean;
  invalidReason?: string;
}

export interface Scorer<S = unknown> {
  schedule(seed: number): S;
  /** Fastest a human could physically finish, used for the "too fast" validity rule. */
  minDurationMs(schedule: S): number;
  /** Returns null when the payload is malformed (client bug or tampering) -> HTTP 400. */
  score(schedule: S, payload: unknown): ScoreResult | null;
}

// ---- Refleks ---------------------------------------------------------------
export interface RefleksSchedule { delays: number[] }
export const REFLEKS_ROUNDS = 5;
export const REFLEKS_MAX_EARLY = 3;

export const refleks: Scorer<RefleksSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    return { delays: Array.from({ length: REFLEKS_ROUNDS }, () => randInt(r, 1500, 4500)) };
  },
  minDurationMs: (s) => s.delays.reduce((a, b) => a + b, 0),
  score(_s, payload) {
    const p = payload as { times?: unknown; earlyTaps?: unknown };
    if (!Array.isArray(p?.times) || p.times.length !== REFLEKS_ROUNDS) return null;
    const times = p.times as number[];
    if (!times.every((t) => Number.isFinite(t) && t >= 0 && t < 60000)) return null;
    const early = Number(p.earlyTaps ?? 0);
    if (!Number.isInteger(early) || early < 0 || early > REFLEKS_MAX_EARLY) return null;
    let invalidReason: string | undefined;
    if (hasImpossibleReaction(times)) invalidReason = "too_fast";
    else if (hasIdenticalTimes(times)) invalidReason = "identical";
    return { primary: Math.round(median(times)), secondary: { earlyTaps: early }, valid: !invalidReason, invalidReason };
  },
};

// ---- Rəng və söz (Stroop) ----------------------------------------------------
export const STROOP_COLORS = 4; // qırmızı, mavi, yaşıl, sarı (or circle, square, triangle, star in shape mode)
export const STROOP_TRIALS = 24;
export const STROOP_ERROR_PENALTY_MS = 300;
export interface StroopTrial { word: number; ink: number; congruent: boolean }
export interface StroopSchedule { trials: StroopTrial[] }

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

export const rengVeSoz: Scorer<StroopSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    const trials: StroopTrial[] = [];
    for (let i = 0; i < STROOP_TRIALS / 2; i++) {
      const c = randInt(r, 0, STROOP_COLORS - 1);
      trials.push({ word: c, ink: c, congruent: true });
    }
    for (let i = 0; i < STROOP_TRIALS / 2; i++) {
      const ink = randInt(r, 0, STROOP_COLORS - 1);
      const word = (ink + randInt(r, 1, STROOP_COLORS - 1)) % STROOP_COLORS;
      trials.push({ word, ink, congruent: false });
    }
    return { trials: shuffle(r, trials) };
  },
  minDurationMs: () => STROOP_TRIALS * 100,
  score(s, payload) {
    const p = payload as { answers?: unknown; times?: unknown };
    if (!Array.isArray(p?.answers) || !Array.isArray(p?.times)) return null;
    const answers = p.answers as number[], times = p.times as number[];
    if (answers.length !== STROOP_TRIALS || times.length !== STROOP_TRIALS) return null;
    if (!answers.every((a) => Number.isInteger(a) && a >= 0 && a < STROOP_COLORS)) return null;
    if (!times.every((t) => Number.isFinite(t) && t >= 0 && t < 60000)) return null;

    const errors = answers.filter((a, i) => a !== s.trials[i].ink).length;
    const okInc: number[] = [], okCon: number[] = [];
    s.trials.forEach((t, i) => {
      if (answers[i] !== t.ink) return;
      (t.congruent ? okCon : okInc).push(times[i]);
    });
    let invalidReason: string | undefined;
    if (hasImpossibleReaction(times)) invalidReason = "too_fast";
    else if (hasIdenticalTimes(times)) invalidReason = "identical";
    else if (errors >= STROOP_TRIALS / 2 || okInc.length === 0 || okCon.length === 0) invalidReason = "guessing";

    const incMean = okInc.length ? mean(okInc) : 0;
    const conMean = okCon.length ? mean(okCon) : 0;
    return {
      primary: Math.round(incMean + STROOP_ERROR_PENALTY_MS * errors),
      secondary: { errors, interference: Math.round(incMean - conMean) },
      valid: !invalidReason,
      invalidReason,
    };
  },
};

export const SCORERS: Record<string, Scorer<any>> = {
  refleks,
  "reng-ve-soz": rengVeSoz,
  // stage 3+: yaddas-zenciri, eyni-rengdir, yalanci-yaddas, lovber
};
