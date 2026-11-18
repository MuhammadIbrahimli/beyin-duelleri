import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface ChoiceSchedule { kind: "flanker" | "simon"; trials: { expected: string; stim: string; congruent: boolean; gapMs: number }[] }

/** Five arrows: answer for the middle one. Resolves with the chosen side and the reaction time for every trial. */
export default function play(root: HTMLElement, schedule: ChoiceSchedule): Promise<{ choices: (string | null)[]; times: number[] }> {
  return new Promise((resolve) => {
    const choices: (string | null)[] = [], times: number[] = [];
    const total = schedule.trials.length;
    const dots = h("div", { class: "dots" });
    const stim = h("div", { class: "flanker-stim", "aria-live": "polite" });
    const left = h("button", { class: "btn opt-wide", "aria-label": az.play.left }, "←");
    const right = h("button", { class: "btn opt-wide", "aria-label": az.play.right }, "→");
    const stage = h("div", { class: "stage" }, stim, h("div", { class: "opts" }, left, right));
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0, shownAt = 0, answered = true, timer = 0;
    const finish = (choice: string | null) => {
      if (answered) return;
      answered = true;
      clearTimeout(timer);
      const tr = schedule.trials[i];
      choices.push(choice);
      times.push(choice === null ? 2000 : Math.round(performance.now() - shownAt));
      if (choice === tr.expected) fx.good(); else fx.bad();
      i++;
      setTimeout(trial, tr.gapMs);
    };
    left.addEventListener("pointerdown", () => finish("left"));
    right.addEventListener("pointerdown", () => finish("right"));

    function trial() {
      if (i === total) return resolve({ choices, times });
      dots.textContent = t("play.progress", { n: i + 1, total });
      stim.textContent = schedule.trials[i].stim;
      answered = false;
      requestAnimationFrame(() => {
        shownAt = performance.now();
        timer = window.setTimeout(() => finish(null), 2000);
      });
    }
    setTimeout(trial, 600);
  });
}
