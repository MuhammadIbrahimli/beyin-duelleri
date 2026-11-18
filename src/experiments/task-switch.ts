import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface SwitchSchedule { trials: { digit: number; cue: "parity" | "magnitude"; expected: string }[] }
const TIMEOUT_MS = 3000;

/** The cue colour tells the rule. Blue: odd/even. Red: below/above 5. Buttons are labelled with the current rule. */
export default function play(root: HTMLElement, schedule: SwitchSchedule): Promise<{ choices: (string | null)[]; times: number[] }> {
  return new Promise((resolve) => {
    const choices: (string | null)[] = [], times: number[] = [];
    const total = schedule.trials.length;
    const dots = h("div", { class: "dots" });
    const cue = h("div", { class: "switch-cue" });
    const digit = h("div", { class: "switch-digit" });
    const left = h("button", { class: "btn opt-wide" });
    const right = h("button", { class: "btn opt-wide" });
    const stage = h("div", { class: "stage" }, cue, digit, h("div", { class: "opts" }, left, right));
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0, shownAt = 0, answered = true, timer = 0;
    const answer = (c: string | null) => {
      if (answered) return;
      answered = true;
      clearTimeout(timer);
      choices.push(c);
      times.push(c === null ? TIMEOUT_MS : Math.round(performance.now() - shownAt));
      if (c === schedule.trials[i].expected) fx.tap(); else fx.bad();
      i++;
      setTimeout(step, 250);
    };
    left.addEventListener("pointerdown", () => answer("left"));
    right.addEventListener("pointerdown", () => answer("right"));

    function step() {
      if (i === total) return resolve({ choices, times });
      const tr = schedule.trials[i];
      dots.textContent = t("play.progress", { n: i + 1, total });
      const blue = tr.cue === "parity";
      cue.className = "switch-cue " + (blue ? "blue" : "red");
      cue.textContent = blue ? az.play.cueBlue : az.play.cueRed;
      digit.textContent = String(tr.digit);
      left.textContent = blue ? az.play.odd : az.play.small;
      right.textContent = blue ? az.play.even : az.play.big;
      answered = false;
      requestAnimationFrame(() => {
        shownAt = performance.now();
        timer = window.setTimeout(() => answer(null), TIMEOUT_MS);
      });
    }
    setTimeout(step, 400);
  });
}
