import { DRM_SETS } from "../config/wordsets";
import { LOVBER_QUESTIONS } from "../config/lovber";
import { randInt, rng, shuffle } from "./rng";
import { median } from "./stats";
import { hasIdenticalTimes, hasImpossibleReaction } from "./validity";
import { flanker, nback, simon } from "./attention-tasks";
import { SCORERS_MORE } from "./tasks-more";

export interface ScoreResult {
  primary: number;
  secondary: Record<string, number>;
  valid: boolean;
  invalidReason?: string;
}

export interface Scorer<S = unknown> {
  /** `lang` only matters for experiments with language-bound content (the word lists of "Yalançı yaddaş"). */
  schedule(seed: number, lang?: string): S;
  /** Fastest a human could physically finish, used for the "too fast" validity rule. */
  minDurationMs(schedule: S): number;
  /** What the client may see. Defaults to the whole schedule; strip anything that gives answers away. */
  publicView?(schedule: S): unknown;
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

// ---- Memory span (Yaddaş zənciri on a 3x3 grid, Rəqəm yaddaşı with digits) --------------
export const MEM_MIN = 3;
export const MEM_MAX = 12;
export const MEM_CELLS = 9;
export const MEM_MIN_TAP_MS = 100;
/** seqs[len - MEM_MIN][attempt]: two different sequences per length (a second chance after one error). */
export interface MemSchedule { seqs: number[][][] }

/** Both span experiments share the rules: start at 3, +1 per success, a second error in a row ends it, max 12. */
function spanScorer(cells: number, entryKey: "taps" | "digits"): Scorer<MemSchedule> {
  return {
    schedule(seed) {
      const r = rng(seed);
      const seq = (len: number) => {
        const s: number[] = [];
        while (s.length < len) {
          const c = randInt(r, 0, cells - 1);
          if (c !== s[s.length - 1]) s.push(c); // no immediate repeats: easier to follow on screen
        }
        return s;
      };
      return { seqs: Array.from({ length: MEM_MAX - MEM_MIN + 1 }, (_, i) => [seq(MEM_MIN + i), seq(MEM_MIN + i)]) };
    },
    minDurationMs: () => MEM_MIN * 700,
    score(s, payload) {
      const attempts = (payload as { attempts?: unknown })?.attempts;
      if (!Array.isArray(attempts) || attempts.length === 0 || attempts.length > 2 * (MEM_MAX - MEM_MIN + 1)) return null;
      let len = MEM_MIN, attempt = 0, best = 0, total = 0, done = false, tooFast = false;
      for (const a of attempts as Record<string, unknown>[]) {
        const taps = a?.[entryKey];
        if (done || !Array.isArray(taps) || !Number.isFinite(a.ms) || (a.ms as number) < 0 || (a.ms as number) > 300000) return null;
        const entered = taps as number[];
        if (entered.length < 1 || entered.length > len || !entered.every((c) => Number.isInteger(c) && c >= 0 && c < cells)) return null;
        total += a.ms as number;
        if ((a.ms as number) / entered.length < MEM_MIN_TAP_MS) tooFast = true;
        const want = s.seqs[len - MEM_MIN][attempt];
        if (entered.length === len && entered.every((c, i) => c === want[i])) {
          best = len;
          if (len === MEM_MAX) done = true; else { len++; attempt = 0; }
        } else if (attempt === 1) done = true; // two errors in a row end the task
        else attempt = 1;
      }
      if (!done) return null;
      return { primary: best, secondary: { totalMs: Math.round(total) }, valid: !tooFast, invalidReason: tooFast ? "too_fast" : undefined };
    },
  };
}
export const yaddasZenciri = spanScorer(MEM_CELLS, "taps");
export const reqemYaddasi = spanScorer(10, "digits");

// ---- Go / No-Go (reaction with inhibition) ---------------------------------------------
export const GNG_TRIALS = 30;
export const GNG_PENALTY_COMMISSION_MS = 300; // tapped the red square
export const GNG_PENALTY_MISS_MS = 150;       // missed a green circle
export interface GngTrial { go: boolean; gapMs: number }
export interface GngSchedule { trials: GngTrial[] }

export const goNoGo: Scorer<GngSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    const kinds = shuffle(r, [...Array(21).fill(true), ...Array(9).fill(false)] as boolean[]);
    return { trials: kinds.map((go) => ({ go, gapMs: randInt(r, 500, 900) })) };
  },
  minDurationMs: () => GNG_TRIALS * 900,
  score(s, payload) {
    const taps = (payload as { taps?: unknown })?.taps;
    if (!Array.isArray(taps) || taps.length !== GNG_TRIALS) return null;
    if (!taps.every((x) => x === null || (typeof x === "number" && Number.isFinite(x) && x >= 0 && x < 5000))) return null;
    const hits: number[] = [];
    let commission = 0, miss = 0, noGoTotal = 0;
    s.trials.forEach((t, i) => {
      const rt = taps[i] as number | null;
      if (t.go) { if (rt === null) miss++; else hits.push(rt); }
      else { noGoTotal++; if (rt !== null) commission++; }
    });
    let invalidReason: string | undefined;
    if (hasImpossibleReaction(hits)) invalidReason = "too_fast";
    else if (hits.length === 0) invalidReason = "no_hits";
    else if (commission > noGoTotal / 2 && hits.length > 0) invalidReason = "tapping_everything";
    const meanRt = hits.length ? hits.reduce((a, b) => a + b, 0) / hits.length : 0;
    return {
      primary: Math.round(meanRt + GNG_PENALTY_COMMISSION_MS * commission + GNG_PENALTY_MISS_MS * miss),
      secondary: { commission, miss, hits: hits.length, meanRt: Math.round(meanRt) },
      valid: !invalidReason,
      invalidReason,
    };
  },
};

// ---- Eyni rəngdir? (perception illusions) ---------------------------------------
export type IllusionKind = "brightness" | "muller" | "ebbinghaus";
export interface IllusionRound { kind: IllusionKind; flip: boolean; v: number } // v: 0..100 cosmetic variation
export interface IllusionSchedule { rounds: IllusionRound[] }
export const ILLUSION_ROUNDS = 3;

/** In every round the two shapes ARE equal, so "fooled" = answering "different". */
export const eyniRengdir: Scorer<IllusionSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    const kinds = shuffle(r, ["brightness", "muller", "ebbinghaus"] as IllusionKind[]);
    return { rounds: kinds.map((kind) => ({ kind, flip: r() < 0.5, v: randInt(r, 0, 100) })) };
  },
  minDurationMs: () => ILLUSION_ROUNDS * 300,
  score(_s, payload) {
    const p = payload as { answers?: unknown; times?: unknown };
    if (!Array.isArray(p?.answers) || !Array.isArray(p?.times)) return null;
    const answers = p.answers as boolean[], times = p.times as number[];
    if (answers.length !== ILLUSION_ROUNDS || times.length !== ILLUSION_ROUNDS) return null;
    if (!answers.every((a) => typeof a === "boolean")) return null;
    if (!times.every((x) => Number.isFinite(x) && x >= 0 && x < 300000)) return null;
    const fooled = answers.filter((a) => !a).length;
    const tooFast = hasImpossibleReaction(times);
    return {
      primary: fooled,
      secondary: { totalMs: Math.round(times.reduce((a, b) => a + b, 0)) },
      valid: !tooFast,
      invalidReason: tooFast ? "too_fast" : undefined,
    };
  },
};

// ---- Yalançı yaddaş (false memory, DRM paradigm) ---------------------------------
export type DrmKind = "old" | "new" | "lure";
export interface DrmSchedule {
  setIndex: number;
  study: string[];
  probe: { word: string; kind: DrmKind }[];
  distract: { a: number; b: number; options: number[] }[];
}
export const DRM_PROBES = 12;

export const yalanciYaddas: Scorer<DrmSchedule> = {
  schedule(seed, lang = "az") {
    const r = rng(seed);
    let pool = DRM_SETS.map((s, i) => i).filter((i) => DRM_SETS[i].lang === lang);
    if (pool.length === 0) pool = DRM_SETS.map((s, i) => i).filter((i) => DRM_SETS[i].lang === "az");
    const setIndex = pool[randInt(r, 0, pool.length - 1)]; // global index, the client maps it back to the lure word
    const set = DRM_SETS[setIndex];
    const study = shuffle(r, set.studied);
    const old = shuffle(r, set.studied).slice(0, 6);
    const probe = shuffle(r, [
      ...old.map((word) => ({ word, kind: "old" as DrmKind })),
      ...set.unrelated.map((word) => ({ word, kind: "new" as DrmKind })),
      { word: set.lure, kind: "lure" as DrmKind },
    ]);
    const distract = Array.from({ length: 3 }, () => {
      const a = randInt(r, 3, 9), b = randInt(r, 3, 9), sum = a + b;
      const wrong = shuffle(r, [sum - 2, sum - 1, sum + 1, sum + 2, sum + 3]).slice(0, 3);
      return { a, b, options: shuffle(r, [sum, ...wrong]) };
    });
    return { setIndex, study, probe, distract };
  },
  publicView: (s) => ({ study: s.study, probe: s.probe.map((p) => p.word), distract: s.distract }),
  minDurationMs: () => 12 * 1500 + 15000,
  score(s, payload) {
    const p = payload as { answers?: unknown; times?: unknown };
    if (!Array.isArray(p?.answers) || !Array.isArray(p?.times)) return null;
    const answers = p.answers as boolean[], times = p.times as number[];
    if (answers.length !== DRM_PROBES || times.length !== DRM_PROBES) return null;
    if (!answers.every((a) => typeof a === "boolean")) return null;
    if (!times.every((x) => Number.isFinite(x) && x >= 0 && x < 300000)) return null;
    let correct = 0, lured = 0;
    s.probe.forEach((q, i) => {
      if (q.kind === "lure") lured = answers[i] ? 1 : 0;
      else if (answers[i] === (q.kind === "old")) correct++;
    });
    let invalidReason: string | undefined;
    if (hasImpossibleReaction(times)) invalidReason = "too_fast";
    else if (answers.every((a) => a === answers[0])) invalidReason = "uniform";
    return {
      primary: Math.round((correct / (DRM_PROBES - 1)) * 100),
      secondary: { fellForLure: lured, setIndex: s.setIndex },
      valid: !invalidReason,
      invalidReason,
    };
  },
};

// ---- Lövbər (anchoring) ---------------------------------------------------------
export interface LovberSchedule { questionId: string; anchor: number }

export const lovber: Scorer<LovberSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    const q = LOVBER_QUESTIONS[randInt(r, 0, LOVBER_QUESTIONS.length - 1)];
    return { questionId: q.id, anchor: r() < 0.5 ? q.low : q.high };
  },
  minDurationMs: () => 3000,
  score(s, payload) {
    const p = payload as { answer?: unknown; higher?: unknown };
    const q = LOVBER_QUESTIONS.find((x) => x.id === s.questionId)!;
    if (typeof p?.answer !== "number" || !Number.isFinite(p.answer) || p.answer < 0 || p.answer > q.max) return null;
    if (typeof p.higher !== "boolean") return null;
    return {
      primary: Math.round((Math.abs(p.answer - q.truth) / q.truth) * 100), // error in % of the true value, so every question is comparable
      secondary: { answer: Math.round(p.answer), anchor: s.anchor, saidHigher: p.higher ? 1 : 0, qIndex: LOVBER_QUESTIONS.indexOf(q) },
      valid: true,
    };
  },
};

export const SCORERS: Record<string, Scorer<any>> = {
  flanker,
  simon,
  "n-back": nback,
  ...SCORERS_MORE,
  refleks,
  "reng-ve-soz": rengVeSoz,
  "yaddas-zenciri": yaddasZenciri,
  "eyni-rengdir": eyniRengdir,
  "go-no-go": goNoGo,
  "reqem-yaddasi": reqemYaddasi,
  "yalanci-yaddas": yalanciYaddas,
  lovber,
};
