/** Each experiment is its own lazily loaded chunk. */
export const loaders: Record<string, () => Promise<{ default: (root: HTMLElement, schedule: any) => Promise<unknown> }>> = {
  refleks: () => import("./refleks"),
  "reng-ve-soz": () => import("./reng-ve-soz"),
  "yaddas-zenciri": () => import("./yaddas-zenciri"),
  "eyni-rengdir": () => import("./eyni-rengdir"),
};
export const available = Object.keys(loaders);
