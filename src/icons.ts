// Small stroke icon set (24x24, drawn here, no icon library). Paths only.
const ns = "http://www.w3.org/2000/svg";

export const ICONS: Record<string, string> = {
  // tabs
  exp: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  duels: "M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4",
  rank: "M5 21V11M12 21V4M19 21v-6",
  pass: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6",
  // experiments
  refleks: "M13 2L4 14h7l-1 8 9-12h-7z",
  "reng-ve-soz": "M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z",
  "yaddas-zenciri": "M5 5h3v3H5zM10.5 5h3v3h-3zM16 5h3v3h-3zM5 10.5h3v3H5zM10.5 10.5h3v3h-3zM16 10.5h3v3h-3zM5 16h3v3H5zM10.5 16h3v3h-3zM16 16h3v3h-3z",
  "yalanci-yaddas": "M9 9a3 3 0 116 0c0 2-3 2.5-3 5M12 18.5h.01",
  "eyni-rengdir": "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z",
  lovber: "M12 5a2 2 0 100-4 2 2 0 000 4zM12 5v16M5 12H3a9 9 0 0018 0h-2M8.5 9h7",
  "go-no-go": "M9 8a4 4 0 100 8 4 4 0 000-8zM14 14h7v7h-7z",
  "reqem-yaddasi": "M5 9h14M5 15h14M10 4L8 20M16 4l-2 16",
  // live games
  "live-first": "M12 3a9 9 0 100 18 9 9 0 000-18zM9.5 9.5a2.5 2.5 0 115 0c0 1.7-2.5 2-2.5 4M12 17.5h.01",
  "live-grid": "M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM10 10h4v4h-4zM16 10h4v4h-4zM4 16h4v4H4zM10 16h4v4h-4zM16 16h4v4h-4z",
  "live-memory": "M4 4h7v7H4zM13 13h7v7h-7z",
  "live-reaction": "M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3",
  "live-riddle": "M4 5h16v11H9l-5 4z",
  // misc
  chevron: "M9 6l6 6-6 6",
  check: "M5 12.5l4.5 4.5L19 7.5",
};

export function icon(name: string, size = 24, cls = "ico"): SVGElement {
  const s = document.createElementNS(ns, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("width", String(size));
  s.setAttribute("height", String(size));
  s.setAttribute("class", cls);
  s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", ICONS[name] ?? "");
  s.append(p);
  return s;
}

/** Brand mark: two overlapping "dueling" discs. */
export function mark(size = 28): SVGElement {
  const s = document.createElementNS(ns, "svg");
  s.setAttribute("viewBox", "0 0 32 32");
  s.setAttribute("width", String(size));
  s.setAttribute("height", String(size));
  s.setAttribute("class", "mark");
  s.setAttribute("aria-hidden", "true");
  const mk = (cx: number, fill: string) => {
    const c = document.createElementNS(ns, "circle");
    c.setAttribute("cx", String(cx)); c.setAttribute("cy", "16"); c.setAttribute("r", "9"); c.setAttribute("fill", fill);
    return c;
  };
  s.append(mk(12, "var(--c-primary)"), mk(20, "var(--c-good)"));
  const lens = document.createElementNS(ns, "path");
  lens.setAttribute("d", "M16 8.6a9 9 0 010 14.8 9 9 0 010-14.8z");
  lens.setAttribute("fill", "var(--c-bg)");
  s.append(lens);
  return s;
}
