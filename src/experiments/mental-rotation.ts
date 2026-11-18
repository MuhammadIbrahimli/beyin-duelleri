import { el, h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export type Pt = [number, number];
export interface RotationSchedule { trials: { left: Pt[]; right: Pt[]; same: boolean }[] }

const W = 340, H = 200, S = 70; // figure scale and canvas size

const figure = (pts: Pt[], cx: number) => {
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${(cx + x * S).toFixed(1)} ${(H / 2 + y * S).toFixed(1)}`).join(" ");
  return el("path", { d, fill: "none", stroke: "#f4f5ff", "stroke-width": 6, "stroke-linejoin": "round", "stroke-linecap": "round" });
};

/** Two figures side by side: are they the same shape turned, or one turned and mirrored? Resolves with yes/no per trial. */
export default function play(root: HTMLElement, schedule: RotationSchedule): Promise<{ choices: (string | null)[]; times: number[] }> {
  return new Promise((resolve) => {
    const choices: (string | null)[] = [], times: number[] = [];
    const total = schedule.trials.length;
    const dots = h("div", { class: "dots" });
    const canvas = h("div", { class: "rot-canvas" });
    const yes = h("button", { class: "btn opt-wide" }, az.play.yes);
    const no = h("button", { class: "btn opt-wide" }, az.play.no);
    const stage = h("div", { class: "stage" }, canvas, h("p", { class: "soft" }, az.play.same), h("div", { class: "opts" }, yes, no));
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0, shownAt = 0, answered = true;
    const answer = (c: string) => {
      if (answered) return;
      answered = true;
      choices.push(c);
      times.push(Math.round(performance.now() - shownAt));
      const expected = schedule.trials[i].same ? "yes" : "no";
      if (c === expected) fx.good(); else fx.bad();
      i++;
      setTimeout(step, 250);
    };
    yes.addEventListener("pointerdown", () => answer("yes"));
    no.addEventListener("pointerdown", () => answer("no"));

    function step() {
      if (i === total) return resolve({ choices, times });
      const tr = schedule.trials[i];
      dots.textContent = t("play.progress", { n: i + 1, total });
      const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "rot-svg" }, figure(tr.left, W / 4), figure(tr.right, (3 * W) / 4));
      canvas.replaceChildren(svg);
      answered = false;
      requestAnimationFrame(() => { shownAt = performance.now(); });
    }
    setTimeout(step, 400);
  });
}
