// Four tasks with mechanisms the app does not have yet (written from public paradigm descriptions, no code copied):
//  - Free recall (Murdock, 1962): write down as many studied words as you can; recall is different from recognition.
//  - Attentional blink (Raymond, Shapiro & Arnell, 1992): two digits in a fast stream of letters; the second is often missed if it comes right after the first.
//  - Syllogisms (Ceraso & Provitera / classic syllogistic logic): is the conclusion forced by the premises, whatever the words mean?
//  - Mental arithmetic (speed of simple calculation): solve short problems, scored by correctness and time.
// Scores, thresholds and penalties are starter values (TODO(verify)), see config/points.ts and config/levels.ts.
import type { Scorer } from "./scoring";
import { DRM_SETS } from "../config/wordsets";
import { randInt, rng, shuffle } from "./rng";

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

// ---- Free recall of words --------------------------------------------------------------------------
export interface RecallSchedule { words: string[] }

/** The studied list comes from the word sets of the player's language (the same lists as Yalançı yaddaş). */
export const recall: Scorer<RecallSchedule> = {
  schedule(seed, lang) {
    const r = rng(seed);
    const pool = DRM_SETS.filter((s) => s.lang === (lang === "ru" ? "ru" : "az"));
    const set = pool[randInt(r, 0, pool.length - 1)];
    return { words: shuffle(r, set.studied) };
  },
  minDurationMs: (s) => s.words.length * 1000,
  publicView: (s) => ({ words: s.words }), // the client shows these in the study phase, so nothing is hidden
  score(s, payload) {
    const typed = (payload as { words?: unknown })?.words;
    if (!Array.isArray(typed) || typed.length > 60) return null;
    if (!typed.every((w) => typeof w === "string" && w.length >= 1 && w.length <= 30)) return null;
    const norm = (w: string) => w.normalize("NFC").trim().toLocaleLowerCase();
    const studied = new Set(s.words.map(norm));
    const seen = new Set<string>();
    let recalled = 0, intrusions = 0;
    for (const raw of typed as string[]) {
      const w = norm(raw);
      if (seen.has(w)) continue;
      seen.add(w);
      if (studied.has(w)) recalled++; else intrusions++;
    }
    return { primary: recalled, secondary: { intrusions, studied: s.words.length }, valid: true }; // words recalled, higher is better
  },
};

// ---- Attentional blink ----------------------------------------------------------------------------------
export const BLINK_TRIALS = 8;
export const BLINK_STREAM = 16;
export const BLINK_SHORT_LAG = 1;   // second digit right after the first: the blink window
export const BLINK_LONG_LAG = 6;    // second digit well after it: no blink
export interface BlinkTrial { stream: string[]; t1: number; t2: number; lag: number; cond: "base" | "cost" }
export interface BlinkSchedule { trials: BlinkTrial[] }
const LETTERS = "BCDFGHJKLMNPQRSTVWXZ".split("");

export const blink: Scorer<BlinkSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    const lags = shuffle(r, [BLINK_SHORT_LAG, BLINK_SHORT_LAG, BLINK_SHORT_LAG, BLINK_SHORT_LAG, BLINK_LONG_LAG, BLINK_LONG_LAG, BLINK_LONG_LAG, BLINK_LONG_LAG]);
    const trials = lags.map((lag): BlinkTrial => {
      const t1pos = randInt(r, 3, 6);
      const t2pos = t1pos + 1 + lag;
      const digits = shuffle(r, [1, 2, 3, 4, 6, 7, 8, 9]);
      const stream: string[] = [];
      for (let i = 0; i < BLINK_STREAM; i++) {
        if (i === t1pos) stream.push(String(digits[0]));
        else if (i === t2pos) stream.push(String(digits[1]));
        else stream.push(LETTERS[randInt(r, 0, LETTERS.length - 1)]);
      }
      return { stream, t1: digits[0], t2: digits[1], lag, cond: lag === BLINK_SHORT_LAG ? "base" : "cost" };
    });
    return { trials };
  },
  minDurationMs: () => BLINK_TRIALS * 2000,
  score(s, payload) {
    const reports = (payload as { reports?: unknown })?.reports;
    if (!Array.isArray(reports) || reports.length !== s.trials.length) return null;
    if (!reports.every((p) => Array.isArray(p) && p.length === 2 && p.every((d) => Number.isInteger(d) && d >= 0 && d <= 9))) return null;
    let t2short = 0, t2short_n = 0, t2long = 0, t2long_n = 0, correct = 0;
    s.trials.forEach((tr, i) => {
      const [r1, r2] = reports[i] as number[];
      if (r1 === tr.t1) correct++;
      if (r2 === tr.t2) correct++;
      if (tr.cond === "base") { t2short_n++; if (r2 === tr.t2) t2short++; }
      else { t2long_n++; if (r2 === tr.t2) t2long++; }
    });
    const blinkCost = Math.round((t2long / t2long_n - t2short / t2short_n) * 100);
    return {
      primary: Math.round((correct / (s.trials.length * 2)) * 100), // percent of digits reported correctly
      secondary: { blinkCostPct: blinkCost, trials: s.trials.length },
      valid: true,
    };
  },
};

// ---- Syllogisms -------------------------------------------------------------------------------------------
// Symbols only: ∀ all, ∃ some, ∅ none, ⊂ inside, ∩ shared. The conclusion is valid when it must follow from the premises.
export interface SyllogismItem { premises: string[]; conclusion: string; valid: boolean }
export const SYLLOGISMS: SyllogismItem[] = [
  { premises: ["∀ A ⊂ B", "∀ B ⊂ C"], conclusion: "∀ A ⊂ C", valid: true },
  { premises: ["∀ A ⊂ B", "∀ C ⊂ B"], conclusion: "∀ A ⊂ C", valid: false },
  { premises: ["A ∩ B = ∅", "∀ C ⊂ A"], conclusion: "C ∩ B = ∅", valid: true },
  { premises: ["∃ A ∩ B ≠ ∅", "∀ B ⊂ C"], conclusion: "∃ A ∩ C ≠ ∅", valid: true },
  { premises: ["∃ A ∩ B ≠ ∅", "∃ B ∩ C ≠ ∅"], conclusion: "∃ A ∩ C ≠ ∅", valid: false },
  { premises: ["B ∩ A = ∅", "B ∩ C = ∅"], conclusion: "A ∩ C = ∅", valid: false },
];

export const syllogism: Scorer<{ items: number }> = {
  schedule: () => ({ items: SYLLOGISMS.length }),
  minDurationMs: () => SYLLOGISMS.length * 2000,
  publicView: () => ({ items: SYLLOGISMS.map((x) => ({ premises: x.premises, conclusion: x.conclusion })) }),
  score(_s, payload) {
    const a = (payload as { answers?: unknown })?.answers;
    if (!Array.isArray(a) || a.length !== SYLLOGISMS.length || !a.every((x) => typeof x === "boolean")) return null;
    const correct = SYLLOGISMS.filter((it, i) => a[i] === it.valid).length;
    return { primary: correct, secondary: { items: SYLLOGISMS.length }, valid: true }; // correct judgements, higher is better
  },
};

// ---- Mental arithmetic --------------------------------------------------------------------------------------
export const ARITH_PROBLEMS = 10;
export interface ArithProblem { text: string; answer: number }
export interface ArithSchedule { problems: ArithProblem[] }

export const arithmetic: Scorer<ArithSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    const problems: ArithProblem[] = Array.from({ length: ARITH_PROBLEMS }, (_, i) => {
      const kind = i % 3; // addition, subtraction, multiplication in turn
      if (kind === 0) { const a = randInt(r, 12, 89), b = randInt(r, 12, 89); return { text: `${a} + ${b}`, answer: a + b }; }
      if (kind === 1) { const a = randInt(r, 40, 99), b = randInt(r, 11, a - 1); return { text: `${a} − ${b}`, answer: a - b }; }
      const a = randInt(r, 3, 9), b = randInt(r, 11, 19);
      return { text: `${a} × ${b}`, answer: a * b };
    });
    return { problems };
  },
  minDurationMs: (s) => s.problems.length * 1000,
  publicView: (s) => ({ problems: s.problems.map((p) => p.text) }), // the answers stay on the server
  score(s, payload) {
    const p = payload as { answers?: unknown; times?: unknown };
    if (!Array.isArray(p?.answers) || !Array.isArray(p?.times)) return null;
    if (p.answers.length !== s.problems.length || p.times.length !== s.problems.length) return null;
    if (!p.answers.every((x) => Number.isInteger(x) && Math.abs(x) < 100000)) return null;
    if (!p.times.every((x) => typeof x === "number" && Number.isFinite(x) && x >= 0 && x < 60000)) return null;
    const answers = p.answers as number[], times = p.times as number[];
    const ok: number[] = [];
    let wrong = 0;
    s.problems.forEach((pr, i) => { if (answers[i] === pr.answer) ok.push(times[i]); else wrong++; });
    const errorRate = wrong / s.problems.length;
    const invalidReason = ok.length === 0 ? "no_hits" : errorRate > 0.5 ? "guessing" : undefined;
    return {
      primary: Math.round(mean(ok) + 1000 * errorRate), // mean correct time plus an error penalty, ms; lower is better
      secondary: { wrong, meanMs: Math.round(mean(ok)) },
      valid: !invalidReason,
      invalidReason,
    };
  },
};

export const SCORERS_EXTRA: Record<string, Scorer<any>> = {
  "word-recall": recall,
  "attentional-blink": blink,
  syllogism,
  "mental-arithmetic": arithmetic,
};
