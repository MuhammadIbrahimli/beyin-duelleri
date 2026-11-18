import { el, h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface SearchSchedule { trials: { size: number; items: { cell: number; ch: "T" | "L"; rot: 0 | 90 | 180 | 270 }[]; cond: "base" | "cost" }[] }
const CELL = 60, GRID = 4, TIMEOUT_MS = 4000;

/** Is there a T among the L's? Items are drawn in a 4x4 grid; the answer is yes or no. */
export default function play(root: HTMLElement, schedule: SearchSchedule): Promise<{ choices: (string | null)[]; times: number[] }> {
  return new Promise((resolve) => {
    const choices: (string | null)[] = [], times: number[] = [];
    const total = schedule.trials.length;
    const dots = h("div", { class: "dots" });
    const canvas = h("div", { class: "vs-canvas" });
    const yes = h("button", { class: "btn opt-wide" }, az.play.yes);
    const no = h("button", { class: "btn opt-wide" }, az.play.no);
    const stage = h("div", { class: "stage" }, canvas, h("p", { class: "soft" }, az.play.searchAsk), h("div", { class: "opts" }, yes, no));
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0, shownAt = 0, answered = true, timer = 0;
    const answer = (c: "yes" | "no" | null) => {
      if (answered) return;
      answered = true;
      clearTimeout(timer);
      choices.push(c);
      times.push(c === null ? TIMEOUT_MS : Math.round(performance.now() - shownAt));
      fx.tap(); // no right/wrong sound: the answer is not revealed
      i++;
      setTimeout(step, 250);
    };
    yes.addEventListener("pointerdown", () => answer("yes"));
    no.addEventListener("pointerdown", () => answer("no"));

    function draw(tr: SearchSchedule["trials"][number]) {
      const svg = el("svg", { viewBox: `0 0 ${CELL * GRID} ${CELL * GRID}`, class: "vs-svg" });
      for (const it of tr.items) {
        const cx = (it.cell % GRID) * CELL + CELL / 2, cy = Math.floor(it.cell / GRID) * CELL + CELL / 2;
        const txt = el("text", { x: cx, y: cy + 11, "text-anchor": "middle", "font-size": 34, "font-weight": 700, fill: "#f4f5ff", transform: `rotate(${it.rot} ${cx} ${cy})` });
        txt.textContent = it.ch;
        svg.append(txt);
      }
      canvas.replaceChildren(svg);
    }

    function step() {
      if (i === total) return resolve({ choices, times });
      const tr = schedule.trials[i];
      dots.textContent = t("play.progress", { n: i + 1, total });
      draw(tr);
      answered = false;
      requestAnimationFrame(() => {
        shownAt = performance.now();
        timer = window.setTimeout(() => answer(null), TIMEOUT_MS);
      });
    }
    setTimeout(step, 400);
  });
}
