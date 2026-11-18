import { h, mount, svg } from "../dom";
import { t, az } from "../i18n";

export interface StroopSchedule { trials: { word: number; ink: number; congruent: boolean }[] }

// circle, square, triangle, star (24x24 paths)
const SHAPES = [
  "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z",
  "M4 4h16v16H4z",
  "M12 3l10 18H2z",
  "M12 2l3 7 7.5.6-5.7 4.9 1.8 7.4L12 18l-6.6 3.9 1.8-7.4L1.5 9.6 9 9z",
];
const CB_KEY = "bd_cb"; // colour-blind mode: stored on this device only, never sent to the server
export const colorBlindMode = () => localStorage.getItem(CB_KEY) === "1";
export const setColorBlindMode = (on: boolean) => localStorage.setItem(CB_KEY, on ? "1" : "0");

export default function play(root: HTMLElement, schedule: StroopSchedule): Promise<{ answers: number[]; times: number[] }> {
  return new Promise((resolve) => {
    const shapes = colorBlindMode();
    const answers: number[] = [];
    const times: number[] = [];
    const total = schedule.trials.length;
    const dots = h("div", { class: "dots" });
    const word = h("div", { class: "stroop-word" });
    const opts = h("div", { class: "opts" + (shapes ? " shapes" : "") });
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, h("div", { class: "stage" }, word, opts)));

    let shownAt = 0;
    const buttons = [0, 1, 2, 3].map((i) =>
      h("button", {
        class: "opt " + (shapes ? "" : "c" + i),
        "aria-label": shapes ? az.play.shapeNames[i] : az.play.colorNames[i],
        onpointerdown: () => answer(i),
      }, shapes ? svg(SHAPES[i]) : null),
    );
    opts.append(...buttons);

    function show() {
      const tr = schedule.trials[answers.length];
      dots.textContent = t("play.progress", { n: answers.length + 1, total });
      word.replaceChildren();
      if (shapes) {
        // shape mode: the word keeps the neutral colour, the "ink" becomes the shape shown next to it
        word.append(svg(SHAPES[tr.ink]), h("span", null, az.play.colorNames[tr.word]));
      } else {
        const w = h("span", null, az.play.colorNames[tr.word]);
        w.style.color = `var(--c-stroop-${tr.ink})`;
        word.append(w);
      }
      // stamp the time on the frame where the stimulus is actually painted
      requestAnimationFrame(() => (shownAt = performance.now()));
    }

    function answer(i: number) {
      if (!shownAt) return;
      times.push(Math.round(performance.now() - shownAt));
      answers.push(i);
      shownAt = 0;
      if (answers.length === total) return resolve({ answers, times });
      show();
    }
    show();
  });
}
