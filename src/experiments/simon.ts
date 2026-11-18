import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";
import type { ChoiceSchedule } from "./flanker";

/** A coloured dot appears left or right: answer the COLOUR. Red is always the left button, blue the right one. */
export default function play(root: HTMLElement, schedule: ChoiceSchedule): Promise<{ choices: (string | null)[]; times: number[] }> {
  return new Promise((resolve) => {
    const choices: (string | null)[] = [], times: number[] = [];
    const total = schedule.trials.length;
    const dots = h("div", { class: "dots" });
    const arena = h("div", { class: "simon-arena" });
    const red = h("button", { class: "btn opt-wide simon-red", "aria-label": az.play.red }, az.play.red);
    const blue = h("button", { class: "btn opt-wide simon-blue", "aria-label": az.play.blue }, az.play.blue);
    const stage = h("div", { class: "stage" }, arena, h("div", { class: "opts" }, red, blue));
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
      arena.replaceChildren();
      i++;
      setTimeout(trial, tr.gapMs);
    };
    red.addEventListener("pointerdown", () => finish("red"));
    blue.addEventListener("pointerdown", () => finish("blue"));

    function trial() {
      if (i === total) return resolve({ choices, times });
      const tr = schedule.trials[i];
      dots.textContent = t("play.progress", { n: i + 1, total });
      answered = false;
      // the stim field holds the side ("left" / "right"); the expected field holds the colour
      arena.replaceChildren(h("div", { class: `simon-dot ${tr.expected} ${tr.stim}` }));
      requestAnimationFrame(() => {
        shownAt = performance.now();
        timer = window.setTimeout(() => finish(null), 2000);
      });
    }
    setTimeout(trial, 600);
  });
}
