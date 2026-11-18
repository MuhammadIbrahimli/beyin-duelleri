// TODO(verify): starter thresholds from SPEC, recompute from percentiles after the first 200 runs.
// "lower": level N if score < threshold; "higher": level N if score >= threshold. Checked from level 4 down; otherwise level 1.
export interface LevelRule { direction: "lower" | "higher"; l4: number; l3: number; l2: number }
export const LEVELS: Record<string, LevelRule | null> = {
  refleks: { direction: "lower", l4: 230, l3: 280, l2: 350 },
  "reng-ve-soz": { direction: "lower", l4: 650, l3: 850, l2: 1100 },
  "yaddas-zenciri": { direction: "higher", l4: 8, l3: 6, l2: 5 },
  "yalanci-yaddas": { direction: "higher", l4: 96, l3: 86, l2: 70 },
  "eyni-rengdir": { direction: "lower", l4: 1, l3: 2, l2: 3 },
  lovber: null,
  "go-no-go": { direction: "lower", l4: 380, l3: 480, l2: 650 },
  "reqem-yaddasi": { direction: "higher", l4: 9, l3: 7, l2: 5 },
  flanker: { direction: "lower", l4: 420, l3: 520, l2: 700 },
  simon: { direction: "lower", l4: 430, l3: 530, l2: 720 },
  "n-back": { direction: "higher", l4: 95, l3: 85, l2: 70 },
};
