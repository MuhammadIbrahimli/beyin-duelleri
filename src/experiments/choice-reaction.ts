import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface ChoiceRtSchedule { trials: { colour: "red" | "blue" }[] }

/** A coloured circle appears. Press the button of its colour, as fast as you can. */
export default function play(root: HTMLElement, schedule: ChoiceRtSchedule): Promise<{ choices: string[]; times: number[] }> {
  return new Promise((resolve) => {
    const choices: string[] = [], times: number[] = [];
    const total = schedule.trials.length;
    const dots = h("div", { class: "dots" });
    const circle = h("div", { class: "cr-circle" });
    const red = h("button", { class: "btn opt-wide cr-red" }, az.play.crRed);
    const blue = h("button", { class: "btn opt-wide cr-blue" }, az.play.crBlue);
    const stage = h("div", { class: "stage" }, circle, h("div", { class: "opts" }, red, blue));
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0, shownAt = 0, answered = true;
    const answer = (c: "red" | "blue") => {
      if (answered) return;
      answered = true;
      choices.push(c === "red" ? "left" : "right");
      times.push(Math.round(performance.now() - shownAt));
      fx.tap();
      i++;
      setTimeout(step, 300);
    };
    red.addEventListener("pointerdown", () => answer("red"));
    blue.addEventListener("pointerdown", () => answer("blue"));

    function step() {
      if (i === total) return resolve({ choices, times });
      dots.textContent = t("play.progress", { n: i + 1, total });
      circle.style.background = schedule.trials[i].colour === "red" ? "#ff5a5f" : "#4aa3ff";
      answered = false;
      requestAnimationFrame(() => { shownAt = performance.now(); });
    }
    setTimeout(step, 300);
  });
}
