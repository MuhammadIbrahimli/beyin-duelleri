// TODO(verify): every fact below must be checked against a reliable source before launch (sourceUrl is empty on
// purpose: no link was opened while writing this list). The values are widely quoted round figures, but "widely
// quoted" is not a source: confirm each one, fix `truth`, and add the link. SPEC asks for 10-15 rotating questions.
export interface LovberQuestion {
  id: string;
  truth: number;      // correct answer
  unit: "m" | "km" | "ms" | "";  // code, shown through az.lovber.units; "" = a plain count
  low: number;        // low anchor
  high: number;       // high anchor
  max: number;        // answers above this are rejected as nonsense
  sourceUrl: string;  // TODO(verify)
}

const src = "TODO(verify)";
export const LOVBER_QUESTIONS: LovberQuestion[] = [
  { id: "caspian-depth", truth: 1025, unit: "m", low: 200, high: 2000, max: 20000, sourceUrl: src },
  { id: "everest-height", truth: 8849, unit: "m", low: 3000, high: 20000, max: 100000, sourceUrl: src },
  { id: "moon-distance", truth: 384400, unit: "km", low: 50000, high: 900000, max: 999999, sourceUrl: src },
  { id: "human-bones", truth: 206, unit: "", low: 50, high: 600, max: 10000, sourceUrl: src },
  { id: "eiffel-height", truth: 330, unit: "m", low: 100, high: 1000, max: 20000, sourceUrl: src },
  { id: "bazarduzu-height", truth: 4466, unit: "m", low: 1500, high: 9000, max: 100000, sourceUrl: src },
  { id: "un-members", truth: 193, unit: "", low: 50, high: 600, max: 10000, sourceUrl: src },
  { id: "sound-speed", truth: 343, unit: "ms", low: 100, high: 1500, max: 100000, sourceUrl: src },
  { id: "azerbaijan-population", truth: 10, unit: "", low: 3, high: 40, max: 10000, sourceUrl: src }, // millions
  { id: "volga-length", truth: 3530, unit: "km", low: 1000, high: 10000, max: 100000, sourceUrl: src },
  { id: "flame-towers-height", truth: 190, unit: "m", low: 50, high: 600, max: 20000, sourceUrl: src },
];
/** Collective result is shown only when every anchor group has at least this many answers. */
export const LOVBER_MIN_GROUP = 100;
