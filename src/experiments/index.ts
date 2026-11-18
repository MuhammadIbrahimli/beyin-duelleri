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
  "n-back": () => import("./n-back"),
  dsst: () => import("./dsst"),
  "mental-rotation": () => import("./mental-rotation"),
  "task-switch": () => import("./task-switch"),
  hanoi: () => import("./hanoi"),
  "visual-search": () => import("./visual-search"),
  bart: () => import("./bart"),
  matrix: () => import("./matrix"),
  "change-detection": () => import("./change-detection"),
  posner: () => import("./posner"),
  mot: () => import("./mot"),
};
export const available = Object.keys(loaders);
