import { el, h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

type Letter = "H" | "S";
export interface NavonSchedule { trials: { expected: Letter; local: Letter; cond: "base" | "cost" }[] }
// 5x5 bitmaps, the same shapes as in shared/tasks-next.ts
const PATTERNS: Record<Letter, boolean[][]> = {
  H: [[1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 1, 1, 1, 1], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1]].map((r) => r.map(Boolean)),
  S: [[0, 1, 1, 1, 1], [1, 0, 0, 0, 0], [0, 1, 1, 1, 0], [0, 0, 0, 0, 1], [1, 1, 1, 1, 0]].map((r) => r.map(Boolean)),
};
const CELL = 40, TIMEOUT_MS = 3000;

/** Large letter built from small letters. Answer the LARGE letter. Resolves with the chosen letter and the reaction time. */
export default function play(root: HTMLElement, schedule: NavonSchedule): Promise<{ choices: (string | null)[]; times: number[] }> {
  return new Promise((resolve) => {
    const choices: (string | null)[] = [], times: number[] = [];
    const total = schedule.trials.length;
    const dots = h("div", { class: "dots" });
    const canvas = h("div", { class: "navon-canvas" });
    const hBtn = h("button", { class: "btn opt-wide" }, "H");
    const sBtn = h("button", { class: "btn opt-wide" }, "S");
    const stage = h("div", { class: "stage" }, canvas, h("p", { class: "soft" }, az.play.navonAsk), h("div", { class: "opts" }, hBtn, sBtn));
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0, shownAt = 0, answered = true, timer = 0;
    const answer = (c: Letter | null) => {
      if (answered) return;
      answered = true;
      clearTimeout(timer);
      choices.push(c);
      times.push(c === null ? TIMEOUT_MS : Math.round(performance.now() - shownAt));
      if (c === schedule.trials[i].expected) fx.tap(); else fx.bad();
      i++;
      setTimeout(step, 250);
    };
    hBtn.addEventListener("pointerdown", () => answer("H"));
    sBtn.addEventListener("pointerdown", () => answer("S"));

    function draw(tr: NavonSchedule["trials"][number]) {
      const svg = el("svg", { viewBox: `0 0 ${CELL * 5} ${CELL * 5}`, class: "navon-svg" });
      PATTERNS[tr.expected].forEach((row, y) => row.forEach((on, x) => {
        if (!on) return;
        const letterEl = el("text", { x: x * CELL + CELL / 2, y: y * CELL + CELL / 2 + 8, "text-anchor": "middle", "font-size": 30, fill: "#f4f5ff" });
        letterEl.textContent = tr.local;
        svg.append(letterEl);
      }));
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
