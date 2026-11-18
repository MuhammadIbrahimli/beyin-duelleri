import { el, h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface ClosureSchedule { trials: { shape: number; gap: number }[] }
const SHOW_MS = 1200;
const SYMBOLS4 = ["●", "■", "▲", "◆"];

// corners of each shape on a 0..100 square; the outline goes corner to corner, the gap skips one edge
const CORNERS: [number, number][][] = [
  Array.from({ length: 24 }, (_, k) => {
    const a = (k / 24) * Math.PI * 2;
    return [50 + Math.cos(a) * 38, 50 + Math.sin(a) * 38] as [number, number];
  }),
  [[14, 14], [86, 14], [86, 86], [14, 86]],
  [[50, 12], [88, 84], [12, 84]],
  [[50, 10], [90, 50], [50, 90], [10, 50]],
];

function outline(shape: number, gap: number): string {
  const pts = CORNERS[shape];
  if (shape === 0) {
    // circle: start just after the gap and run round for 20 of the 24 points, so the gap stays open
    const start = (gap * 6 + 4) % 24;
    return Array.from({ length: 20 }, (_, k) => pts[(start + k) % 24].join(",")).join(" ");
  }
  // polygon: the edge that leaves corner gap % n is missing; run through the corners starting after it
  const n = pts.length;
  const start = (gap % n + 1) % n;
  return Array.from({ length: n }, (_, k) => pts[(start + k) % n].join(",")).join(" ");
}

/** A shape with a gap in its outline. Which shape is it? */
export default function play(root: HTMLElement, schedule: ClosureSchedule): Promise<{ choices: number[] }> {
  return new Promise((resolve) => {
    const choices: number[] = [];
    const total = schedule.trials.length;
    const dots = h("div", { class: "dots" });
    const field = h("div", { class: "cl-field" });
    const opts = h("div", { class: "cl-opts" }, ...SYMBOLS4.map((s, k) => {
      const b = h("button", { class: "btn cl-opt", "aria-label": String(k + 1) }, s);
      b.addEventListener("pointerdown", () => answer(k));
      return b;
    }));
    const stage = h("div", { class: "stage" }, field, h("p", { class: "soft" }, az.play.clAsk), opts);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0, answering = false;
    const answer = (k: number) => {
      if (!answering) return;
      answering = false;
      choices.push(k);
      fx.tap();
      i++;
      setTimeout(step, 300);
    };

    function step() {
      if (i === total) return resolve({ choices });
      dots.textContent = t("play.progress", { n: i + 1, total });
      const tr = schedule.trials[i];
      const svg = el("svg", { viewBox: "0 0 100 100", class: "cl-svg" });
      svg.append(el("polyline", { points: outline(tr.shape, tr.gap), fill: "none", stroke: "#f4f5ff", "stroke-width": 4, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      field.replaceChildren(svg);
      answering = false;
      // the figure is only on screen for a moment; the question stays
      setTimeout(() => { field.replaceChildren(); answering = true; }, SHOW_MS);
    }
    setTimeout(step, 300);
  });
}
