import type { Slug } from "./experiments";

/**
 * Home screen sections. Five skill areas, named after the classic cognitive domains
 * (memory, attention, speed, perception, reasoning). Every experiment belongs to exactly one section;
 * a section grows by adding slugs here, the screen needs no change.
 */
export interface Category {
  id: "memory" | "attention" | "speed" | "perception" | "reasoning";
  slugs: Slug[];
}

export const CATEGORIES: Category[] = [
  { id: "memory", slugs: ["yaddas-zenciri", "yalanci-yaddas", "reqem-yaddasi", "n-back"] },
  { id: "attention", slugs: ["reng-ve-soz", "go-no-go", "flanker", "simon"] },
  { id: "speed", slugs: ["refleks"] },
  { id: "perception", slugs: ["eyni-rengdir"] },
  { id: "reasoning", slugs: ["lovber"] },
];
