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
/** Inline SVG from path data; used for the shape mode of Rəng və söz. */
export function svg(d: string, viewBox = "0 0 24 24"): SVGElement {
  const s = document.createElementNS(SVG, "svg");
  s.setAttribute("viewBox", viewBox);
  const p = document.createElementNS(SVG, "path");
  p.setAttribute("d", d);
  s.append(p);
  return s;
}
