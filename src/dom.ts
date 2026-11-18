type Child = Node | string | null | undefined | false;
type Attrs = Record<string, any>;

/** Tiny element builder: h("button", { class: "btn", onclick }, "text"). */
export function h(tag: string, attrs: Attrs | null = null, ...kids: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of kids) if (c) el.append(c);
  return el;
}

export const mount = (root: HTMLElement, ...nodes: Node[]) => root.replaceChildren(...nodes);

const SVG = "http://www.w3.org/2000/svg";
/** SVG element builder: el("circle", { cx: 10, r: 5 }, child...). */
export function el(tag: string, attrs: Record<string, string | number> = {}, ...kids: Node[]): SVGElement {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  n.append(...kids);
  return n as SVGElement;
}

/** Inline SVG from path data; used for the shape mode of Rəng və söz. */
export function svg(d: string, viewBox = "0 0 24 24"): SVGElement {
  const s = document.createElementNS(SVG, "svg");
  s.setAttribute("viewBox", viewBox);
  const p = document.createElementNS(SVG, "path");
  p.setAttribute("d", d);
  s.append(p);
  return s;
}

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Counts a number up with an ease-out curve (rAF, ~0.8 s). Falls back to the final value for reduced motion. */
export function countUp(el: HTMLElement, to: number, format: (n: number) => string, ms = 800) {
  if (reduced() || to < 10) { el.textContent = format(to); return; }
  const t0 = performance.now();
  const tick = (now: number) => {
    const p = Math.min(1, (now - t0) / ms);
    el.textContent = format(Math.round(to * (1 - Math.pow(1 - p, 3))));
    if (p < 1) requestAnimationFrame(tick);
  };
  el.textContent = format(0);
  requestAnimationFrame(tick);
}

/** One-shot burst of small particles (transform + opacity only). */
export function burst(parent: HTMLElement, colors = ["var(--c-primary)", "var(--c-good)", "#fff"]) {
  if (reduced()) return;
  const box = h("div", { class: "burst", "aria-hidden": "true" });
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + Math.random() * 0.4;
    const d = 70 + Math.random() * 70;
    const p = h("i", { style: `--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d}px;--c:${colors[i % colors.length]};--r:${Math.random() * 360}deg` });
    box.append(p);
  }
  parent.append(box);
  setTimeout(() => box.remove(), 1100);
}
