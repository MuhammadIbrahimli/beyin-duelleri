import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface NameSchedule { trials: { a: string; b: string }[] }

/** Two letters side by side. Is it the same letter? Case does not count: A and a are the same letter. */
export default function play(root: HTMLElement, schedule: NameSchedule): Promise<{ choices: string[]; times: number[] }> {
  return new Promise((resolve) => {
    const choices: string[] = [], times: number[] = [];
    const total = schedule.trials.length;
    const dots = h("div", { class: "dots" });
    const pair = h("div", { class: "nm-pair" });
    const yes = h("button", { class: "btn opt-wide" }, az.play.nmSame);
    const no = h("button", { class: "btn opt-wide" }, az.play.nmDiff);
    const stage = h("div", { class: "stage" }, pair, h("div", { class: "opts" }, yes, no));
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0, shownAt = 0, answered = true;
    const answer = (c: "yes" | "no") => {
      if (answered) return;
      answered = true;
      choices.push(c);
      times.push(Math.round(performance.now() - shownAt));
      fx.tap();
      i++;
      setTimeout(step, 250);
    };
    yes.addEventListener("pointerdown", () => answer("yes"));
    no.addEventListener("pointerdown", () => answer("no"));

    function step() {
      if (i === total) return resolve({ choices, times });
      const tr = schedule.trials[i];
      dots.textContent = t("play.progress", { n: i + 1, total });
      pair.replaceChildren(h("span", { class: "nm-letter" }, tr.a), h("span", { class: "nm-letter" }, tr.b));
      answered = false;
      requestAnimationFrame(() => { shownAt = performance.now(); });
    }
    setTimeout(step, 300);
  });
}
