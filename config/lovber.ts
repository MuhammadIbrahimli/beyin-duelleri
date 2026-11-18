// TODO(verify): every fact below must be checked against a reliable source before launch.
// SPEC needs 10-15 rotating questions; only the Caspian depth from SPEC is here, and its value
// (~1025 m maximum depth) is itself unverified. Do not add facts from memory.
export interface LovberQuestion {
  id: string;
  truth: number;      // correct answer
  unit: string;
  low: number;        // low anchor
  high: number;       // high anchor
  max: number;        // answers above this are rejected as nonsense
  sourceUrl: string;  // TODO(verify)
}

export const LOVBER_QUESTIONS: LovberQuestion[] = [
  { id: "caspian-depth", truth: 1025, unit: "m", low: 200, high: 2000, max: 20000, sourceUrl: "TODO(verify)" },
];
/** Collective result is shown only when every anchor group has at least this many answers. */
export const LOVBER_MIN_GROUP = 100;
