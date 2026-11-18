import type { Slug } from "./experiments";

/**
 * Home screen sections. Five skill areas, named after the classic cognitive domains.
 * Every experiment belongs to exactly one section; a section grows by adding slugs here.
 * Rule: one test per mechanism. Two tests that measure the same thing are not both kept.
 */
export interface Category {
  id: "memory" | "attention" | "speed" | "perception" | "reasoning";
  slugs: Slug[];
}

export const CATEGORIES: Category[] = [
  { id: "memory", slugs: ["yaddas-zenciri", "yalanci-yaddas", "reqem-yaddasi", "n-back", "change-detection", "word-recall", "serial-reaction", "object-location", "paired-associates", "temporal-order-memory"] },
  { id: "attention", slugs: ["reng-ve-soz", "go-no-go", "posner", "mot", "attentional-blink", "inattentional-blindness", "dual-task", "selective-listening", "vigilance-clock"] },
  { id: "speed", slugs: ["refleks", "dsst", "time-estimation", "mental-arithmetic", "finger-tapping", "rhythm-sync", "name-matching", "choice-reaction", "motor-sequence", "cancellation", "tracing"] },
  { id: "perception", slugs: ["eyni-rengdir", "mental-rotation", "visual-search", "random-dot-motion", "numerosity", "line-bisection", "pitch-discrimination", "contrast-detection"] },
  { id: "reasoning", slugs: ["lovber", "task-switch", "hanoi", "bart", "matrix", "card-sort", "cognitive-reflection", "syllogism", "iowa-gambling", "probability-matching", "wason", "odd-one-out"] },
];
