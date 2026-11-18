/** Each experiment is its own lazily loaded chunk. */
export const loaders: Record<string, () => Promise<{ default: (root: HTMLElement, schedule: any) => Promise<unknown> }>> = {
  refleks: () => import("./refleks"),
  "reng-ve-soz": () => import("./reng-ve-soz"),
  "yaddas-zenciri": () => import("./yaddas-zenciri"),
  "eyni-rengdir": () => import("./eyni-rengdir"),
  "yalanci-yaddas": () => import("./yalanci-yaddas"),
  lovber: () => import("./lovber"),
  "go-no-go": () => import("./go-no-go"),
  "reqem-yaddasi": () => import("./reqem-yaddasi"),
  flanker: () => import("./flanker"),
  simon: () => import("./simon"),
  "n-back": () => import("./n-back"),
  pvt: () => import("./pvt"),
  dsst: () => import("./dsst"),
  "mental-rotation": () => import("./mental-rotation"),
  "task-switch": () => import("./task-switch"),
};
export const available = Object.keys(loaders);
