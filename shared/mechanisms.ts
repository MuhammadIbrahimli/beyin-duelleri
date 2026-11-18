import type { Slug } from "./experiments";

/**
 * The measured mechanism of each test. Two tests with the same mechanism are duplicates: keep one.
 * The type forces every experiment to have an entry; tests/features.test.ts checks that no mechanism repeats.
 */
export const MECHANISM: Record<Slug, string> = {
  refleks: "simple-reaction",
  "reng-ve-soz": "conflict-stroop",
  "yaddas-zenciri": "span-spatial",
  "yalanci-yaddas": "false-memory",
  "eyni-rengdir": "illusion-context",
  lovber: "anchoring",
  "go-no-go": "inhibition",
  "reqem-yaddasi": "span-verbal",
  "task-switch": "task-switching",
  dsst: "symbol-lookup",
  "mental-rotation": "spatial-rotation",
  hanoi: "planning",
  "n-back": "working-memory-updating",
  "visual-search": "visual-search",
  bart: "risk-decision",
  matrix: "rule-induction",
  "change-detection": "visual-capacity",
  posner: "attention-orienting",
  mot: "multiple-object-tracking",
  "card-sort": "rule-learning-feedback",
  "time-estimation": "time-estimation",
  "cognitive-reflection": "cognitive-reflection",
  "word-recall": "free-recall",
  "attentional-blink": "attentional-blink",
  syllogism: "syllogistic-reasoning",
  "mental-arithmetic": "mental-arithmetic",
};
