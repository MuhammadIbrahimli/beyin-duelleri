import { randInt, rng } from "./rng";
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

export const SCORERS: Record<string, Scorer<any>> = {
  refleks,
  // stage 2+: reng-ve-soz, yaddas-zenciri, eyni-rengdir, yalanci-yaddas, lovber
};
