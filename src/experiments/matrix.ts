import { el, h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

type Cell = { n: 1 | 2 | 3; shape: 0 | 1 | 2; colour: 0 | 1 | 2 };
export interface MatrixSchedule { puzzles: { grid: (Cell | null)[]; options: Cell[] }[] }
const COLOURS = ["#ff5a5f", "#4aa3ff", "#4cd483"];
const TIME_MS = 30000;

/** One shape drawn in a cell: count, shape and colour. Used for the grid and for the options. */
export function cellSvg(c: Cell | null, size: number, missing = false): SVGElement {
  const svg = el("svg", { viewBox: "0 0 100 100", width: size, height: size, class: "mx-cell" });
  svg.append(el("rect", { x: 2, y: 2, width: 96, height: 96, rx: 10, fill: "none", stroke: "#2a2f55", "stroke-width": 2 }));
  if (!c) {
    if (missing) {
      const q = el("text", { x: 50, y: 66, "text-anchor": "middle", "font-size": 52, fill: "#ffd23f", "font-weight": 800 });
      q.textContent = "?";
      svg.append(q);
    }
    return svg;
  }
  const fill = COLOURS[c.colour];
  const xs = c.n === 1 ? [50] : c.n === 2 ? [32, 68] : [22, 50, 78];
  for (const x of xs) {
    if (c.shape === 0) svg.append(el("circle", { cx: x, cy: 50, r: 12, fill }));
    else if (c.shape === 1) svg.append(el("rect", { x: x - 11, y: 39, width: 22, height: 22, fill }));
    else svg.append(el("polygon", { points: `${x},38 ${x + 13},62 ${x - 13},62`, fill }));
  }
  return svg;
}

/** 3x3 puzzle: pick the option that completes the pattern. Eight puzzles, no feedback. */
export default function play(root: HTMLElement, schedule: MatrixSchedule): Promise<{ choices: number[] }> {
  return new Promise((resolve) => {
    const choices: number[] = [];
    const total = schedule.puzzles.length;
    const dots = h("div", { class: "dots" });
    const grid = h("div", { class: "mx-grid" });
    const options = h("div", { class: "mx-options" });
    const timer = h("div", { class: "soft" });
    const stage = h("div", { class: "stage" }, grid, h("p", { class: "soft" }, az.play.matrixAsk), options, timer);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0, tick = 0;
    function show() {
      const p = schedule.puzzles[i];
      dots.textContent = t("play.progress", { n: i + 1, total });
      grid.replaceChildren(...p.grid.map((c) => cellSvg(c, 84, c === null)));
      options.replaceChildren(...p.options.map((o, k) => {
        const b = h("button", { class: "mx-opt", "aria-label": String(k + 1) }, cellSvg(o, 72));
        b.addEventListener("pointerdown", () => answer(k));
        return b;
      }));
      const started = Date.now();
      clearInterval(tick);
      tick = window.setInterval(() => {
        const left = Math.max(0, Math.ceil((TIME_MS - (Date.now() - started)) / 1000));
        timer.textContent = t("play.secondsLeft", { n: left });
        if (left === 0) answer(-1);
      }, 250);
    }

    function answer(k: number) {
      clearInterval(tick);
      choices.push(k);
      fx.tap();
      i++;
      if (i === total) return resolve({ choices });
      setTimeout(show, 250);
    }
    setTimeout(show, 300);
  });
}
