// Five tasks with mechanisms the app does not have yet (written from public paradigm descriptions, no code copied):
//  - Verbal fluency (Thurstone, 1938): write as many words as possible that start with a given letter in one minute.
//    There is no dictionary on the server: the check is the form of the word only (letters, starting letter, no repeats).
//  - Flicker fusion (critical flicker fusion, psychophysics): lower the flicker rate until it looks steady; the rate is the threshold.
//  - Temporal order judgment (Hirsh & Sherrick, 1961): two flashes a few milliseconds apart; say which came first.
//  - Gestalt closure (Kanizsa-style closure): recognise a shape whose outline has a gap.
//  - Sound localisation: say whether a short tone came from the left, the centre or the right.
// Scores, thresholds and penalties are starter values (TODO(verify)), see config/points.ts and config/levels.ts.
import type { Scorer } from "./scoring";
import { randInt, rng, shuffle } from "./rng";

// ---- Verbal fluency -------------------------------------------------------------------------------------
export const FLUENCY_LETTER: Record<string, string> = { az: "s", ru: "к" };
export interface FluencySchedule { letter: string }

export const fluency: Scorer<FluencySchedule> = {
  schedule(_seed, lang) {
    return { letter: FLUENCY_LETTER[lang === "ru" ? "ru" : "az"] };
  },
  minDurationMs: () => 30000,
  publicView: (s) => ({ letter: s.letter }),
  score(s, payload) {
    const words = (payload as { words?: unknown })?.words;
    if (!Array.isArray(words) || words.length > 200) return null;
    if (!words.every((w) => typeof w === "string" && w.length <= 40)) return null;
    const norm = (w: string) => w.normalize("NFC").trim().toLocaleLowerCase();
    const seen = new Set<string>();
    let valid = 0, wrongStart = 0;
    for (const raw of words as string[]) {
      const w = norm(raw);
      if (!/^[\p{L}-]{2,25}$/u.test(w)) continue;
      if (!w.startsWith(s.letter.toLocaleLowerCase())) { wrongStart++; continue; }
      if (seen.has(w)) continue;
      seen.add(w);
      valid++;
    }
    return { primary: valid, secondary: { wrongStart, typed: words.length }, valid: true }; // distinct words that fit, higher is better
  },
};

// ---- Flicker fusion -------------------------------------------------------------------------------------------
export const FLICKER_TRIALS = 3;
export const FLICKER_START_HZ = 30;   // a screen refresh of 60 Hz limits a visible on/off flicker to about 30 Hz
export interface FlickerSchedule { trials: number; startHz: number }

export const flicker: Scorer<FlickerSchedule> = {
  schedule: () => ({ trials: FLICKER_TRIALS, startHz: FLICKER_START_HZ }),
  minDurationMs: () => FLICKER_TRIALS * 5000,
  score(_s, payload) {
    const th = (payload as { thresholds?: unknown })?.thresholds;
    if (!Array.isArray(th) || th.length !== FLICKER_TRIALS) return null;
    if (!th.every((x) => typeof x === "number" && Number.isFinite(x) && x >= 1 && x <= 40)) return null;
    const mean = (th as number[]).reduce((a, b) => a + b, 0) / FLICKER_TRIALS;
    return { primary: Math.round(mean * 10) / 10, secondary: { trials: FLICKER_TRIALS }, valid: true }; // Hz at which flicker fused, higher is better
  },
};

// ---- Temporal order judgment ----------------------------------------------------------------------------------
export const TOJ_TRIALS = 12;
export const TOJ_SOAS = [20, 40, 80, 120]; // ms between the two flashes
export interface TojTrial { first: "left" | "right"; soa: number }
export interface TojSchedule { trials: TojTrial[] }

export const tojTask: Scorer<TojSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    return {
      trials: Array.from({ length: TOJ_TRIALS }, (_, i): TojTrial => ({
        first: r() < 0.5 ? "left" : "right",
        soa: TOJ_SOAS[i % TOJ_SOAS.length],
      })),
    };
  },
  minDurationMs: (s) => s.trials.length * 900,
  publicView: (s) => ({ trials: s.trials.map((t) => ({ soa: t.soa, first: t.first })) }), // the presented order; the player must say which came first
  score(s, payload) {
    const choices = (payload as { choices?: unknown })?.choices;
    if (!Array.isArray(choices) || choices.length !== s.trials.length) return null;
    if (!choices.every((c) => c === "left" || c === "right")) return null;
    const correct = s.trials.filter((t, i) => choices[i] === t.first).length;
    return { primary: Math.round((correct / s.trials.length) * 100), secondary: { trials: s.trials.length }, valid: true };
  },
};

// ---- Gestalt closure -----------------------------------------------------------------------------------------------
export const CLOSURE_TRIALS = 8;
export interface ClosureTrial { shape: number; gap: number }
export interface ClosureSchedule { trials: ClosureTrial[] }

export const closure: Scorer<ClosureSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    return {
      trials: Array.from({ length: CLOSURE_TRIALS }, (): ClosureTrial => ({ shape: randInt(r, 0, 3), gap: randInt(r, 0, 3) })),
    };
  },
  minDurationMs: (s) => s.trials.length * 1500,
  publicView: (s) => ({ trials: s.trials.map((t) => ({ shape: t.shape, gap: t.gap })) }),
  score(s, payload) {
    const choices = (payload as { choices?: unknown })?.choices;
    if (!Array.isArray(choices) || choices.length !== s.trials.length) return null;
    if (!choices.every((c) => Number.isInteger(c) && c >= 0 && c <= 3)) return null;
    const correct = s.trials.filter((t, i) => choices[i] === t.shape).length;
    return { primary: Math.round((correct / s.trials.length) * 100), secondary: { trials: s.trials.length }, valid: true };
  },
};

// ---- Sound localisation ----------------------------------------------------------------------------------------------
export const SOUND_TRIALS = 12;
export interface SoundTrial { pan: -1 | 0 | 1 }
export interface SoundSchedule { trials: SoundTrial[] }

export const sound: Scorer<SoundSchedule> = {
  schedule(seed) {
    const r = rng(seed);
    const pans = shuffle(r, [-1, -1, -1, 0, 0, 0, 0, 1, 1, 1, 1, 1].slice(0, SOUND_TRIALS)) as (-1 | 0 | 1)[];
    return { trials: pans.map((pan) => ({ pan })) };
  },
  minDurationMs: (s) => s.trials.length * 1000,
  publicView: (s) => ({ trials: s.trials.map(() => ({})) }), // the count only: the tone is the stimulus and the player hears where it is
  score(s, payload) {
    const choices = (payload as { choices?: unknown })?.choices;
    if (!Array.isArray(choices) || choices.length !== s.trials.length) return null;
    if (!choices.every((c) => c === "left" || c === "center" || c === "right")) return null;
    const name = (p: number) => (p < 0 ? "left" : p > 0 ? "right" : "center");
    const correct = s.trials.filter((t, i) => choices[i] === name(t.pan)).length;
    return { primary: Math.round((correct / s.trials.length) * 100), secondary: { trials: s.trials.length }, valid: true };
  },
};

export const SCORERS_BATCH_C: Record<string, Scorer<any>> = {
  "verbal-fluency": fluency,
  "flicker-fusion": flicker,
  "temporal-order-judgment": tojTask,
  "gestalt-closure": closure,
  "sound-localization": sound,
};
