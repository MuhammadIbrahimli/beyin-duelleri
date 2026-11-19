import { stopAll } from "./audio";
export interface Ctx { params: Record<string, string>; query: URLSearchParams }
type Handler = (ctx: Ctx) => void | Promise<void>;
const routes: { re: RegExp; keys: string[]; fn: Handler }[] = [];

export function route(pattern: string, fn: Handler) {
  const keys: string[] = [];
  const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "/?$");
  routes.push({ re, keys, fn });
}

export function go(url: string, replace = false) {
  history[replace ? "replaceState" : "pushState"]({}, "", url);
  void render();
}

const leaveHooks: (() => void)[] = [];
/** Runs once, the next time the player navigates anywhere (used to close a live socket). */
export function onLeave(fn: () => void) {
  leaveHooks.push(fn);
}

let generation = 0;
/** Changes on every navigation: a game that finishes after the player left checks this and stays quiet. */
export const navGeneration = () => generation;

export async function render() {
  generation++;
  stopAll();
  for (const f of leaveHooks.splice(0)) f();
  const u = new URL(location.href);
  for (const r of routes) {
    const m = r.re.exec(u.pathname);
    if (m) {
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      window.scrollTo(0, 0);
      await r.fn({ params, query: u.searchParams });
      return;
    }
  }
  go("/", true);
}

export function startRouter() {
  addEventListener("popstate", () => void render());
  document.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement).closest("a[data-link]") as HTMLAnchorElement | null;
    if (a) { e.preventDefault(); go(a.getAttribute("href")!); }
  });
  void render();
}
