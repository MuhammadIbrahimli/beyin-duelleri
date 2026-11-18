// Two attention tasks with mechanisms the app does not have yet (written from public paradigm descriptions, no code copied):
//  - Posner cueing (Posner, 1980): a cue says where the target will appear; valid cues speed the answer, invalid ones slow it.
//  - Multiple object tracking (Pylyshyn & Storm, 1988): follow a few highlighted moving objects among identical ones.
// Scores, thresholds and penalties are starter values (TODO(verify)), see config/points.ts and config/levels.ts.
import type { Scorer } from "./scoring";
import { randInt, rng, shuffle } from "./rng";
import { finish, judge } from "./tasks-more";

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

// ---- Posner cueing ----------------------------------------------------------------------------------
export const POSNER_TRIALS = 24;
export interface PosnerTrial { side: "left" | "right"; cue: "left" | "right"; cond: "base" | "cost"; gapMs: number }
export interface PosnerSchedule { trials: PosnerTrial[] }

export const posner: Scorer<PosnerSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    // two thirds of the cues are valid (they point to the side the target appears on)
    const valid = shuffle(r, [...Array(16).fill(true), ...Array(8).fill(false)] as boolean[]);
    const trials = valid.map((isValid): PosnerTrial => {
      const cue = r() < 0.5 ? "left" : "right";
      const side = isValid ? cue : cue === "left" ? "right" : "left";
      return { side, cue, cond: isValid ? "base" : "cost", gapMs: randInt(r, 700, 1100) };
    });
    return { trials };
  },
  minDurationMs: (s) => s.trials.length * 900,
  score(s, payload) {
    const j = judge(s.trials.map((t) => ({ expected: t.side, cond: t.cond })), payload, ["left", "right"]);
    if (!j) return null;
    return finish(j, { orientingCostMs: Math.round(mean(j.cost) - mean(j.base)) }); // extra time after an invalid cue
  },
};

// ---- Multiple object tracking -----------------------------------------------------------------------
export const MOT_DOTS = 8;
export const MOT_TARGETS = [2, 3, 4, 4];       // number of targets per trial
export interface MotTrial { targets: number[]; seed: number }
export interface MotSchedule { trials: MotTrial[] }

export const mot: Scorer<MotSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    return {
      trials: MOT_TARGETS.map((n) => {
        const targets = shuffle(r, Array.from({ length: MOT_DOTS }, (_, i) => i)).slice(0, n).sort((a, b) => a - b);
        return { targets, seed: randInt(r, 1, 2 ** 31 - 2) }; // the client moves the dots from this seed
      }),
    };
  },
  minDurationMs: () => MOT_TARGETS.length * 8000,
  score(s, payload) {
    const picks = (payload as { picks?: unknown })?.picks;
    if (!Array.isArray(picks) || picks.length !== s.trials.length) return null;
    let correct = 0, total = 0, wrong = 0;
    s.trials.forEach((tr, i) => {
      const p = picks[i] as number[];
      if (!Array.isArray(p) || p.length > MOT_DOTS || !p.every((x) => Number.isInteger(x) && x >= 0 && x < MOT_DOTS)) return;
      if (new Set(p).size !== p.length) return;
      total += tr.targets.length;
      for (const x of p) { if (tr.targets.includes(x)) correct++; else wrong++; }
    });
    if (total === 0 && picks.some((p) => Array.isArray(p) && p.length)) return null;
    return {
      primary: Math.round((correct / total) * 100) || 0, // percent of targets found, higher is better
      secondary: { correct, total, wrong },
      valid: true,
    };
  },
};

export const SCORERS_ORIENTING: Record<string, Scorer<any>> = {
  posner,
  mot,
};
