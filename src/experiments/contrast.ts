import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface ContrastSchedule { trials: { pattern: "left" | "right"; contrast: number }[] }

/** Two panels. Stripes are faint in one of them and absent in the other. Tap the panel with the stripes. */
export default function play(root: HTMLElement, schedule: ContrastSchedule): Promise<{ choices: string[] }> {
  return new Promise((resolve) => {
    const choices: string[] = [];
    const total = schedule.trials.length;
    const dots = h("div", { class: "dots" });
    const left = h("button", { class: "ct-panel", "aria-label": az.play.contrastLeft });
    const right = h("button", { class: "ct-panel", "aria-label": az.play.contrastRight });
    const stage = h("div", { class: "stage" }, h("p", { class: "soft" }, az.play.contrastAsk), h("div", { class: "ct-row" }, left, right));
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0, answering = false;
    const stripes = (c: number) => `repeating-linear-gradient(90deg, rgba(255,255,255,${c}) 0 10px, rgba(0,0,0,0) 10px 20px), #5a5f78`;
    const answer = (side: "left" | "right") => {
      if (!answering) return;
      answering = false;
      choices.push(side);
      fx.tap();
      i++;
      setTimeout(step, 400);
    };
    left.addEventListener("pointerdown", () => answer("left"));
    right.addEventListener("pointerdown", () => answer("right"));

    function step() {
      if (i === total) return resolve({ choices });
      const tr = schedule.trials[i];
      dots.textContent = t("play.progress", { n: i + 1, total });
      const plain = "#5a5f78";
      left.style.background = tr.pattern === "left" ? stripes(tr.contrast) : plain;
      right.style.background = tr.pattern === "right" ? stripes(tr.contrast) : plain;
      answering = true;
    }
    setTimeout(step, 300);
  });
}
