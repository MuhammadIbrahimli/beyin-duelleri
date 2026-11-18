import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface MatchSchedule { outcomes: ("A" | "B")[] }

/** Guess the next outcome. The outcomes are random, but A comes up more often. Each guess is shown with the result. */
export default function play(root: HTMLElement, schedule: MatchSchedule): Promise<{ choices: string[] }> {
  return new Promise((resolve) => {
    const choices: string[] = [];
    const total = schedule.outcomes.length;
    const dots = h("div", { class: "dots" });
    const result = h("div", { class: "pm-result", "aria-live": "polite" });
    const bA = h("button", { class: "btn opt-wide" }, az.play.matchA);
    const bB = h("button", { class: "btn opt-wide" }, az.play.matchB);
    const stage = h("div", { class: "stage" }, h("p", { class: "soft" }, az.play.matchAsk), result, h("div", { class: "opts" }, bA, bB));
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0, answering = false;
    const guess = (g: "A" | "B") => {
      if (!answering) return;
      answering = false;
      choices.push(g);
      const real = schedule.outcomes[i];
      result.textContent = `${real} · ${g === real ? az.play.cardRight : az.play.cardWrong}`;
      if (g === real) fx.good(); else fx.bad();
      i++;
      setTimeout(step, 600);
    };
    bA.addEventListener("pointerdown", () => guess("A"));
    bB.addEventListener("pointerdown", () => guess("B"));

    function step() {
      if (i === total) return resolve({ choices });
      dots.textContent = t("play.progress", { n: i + 1, total });
      result.textContent = "";
      answering = true;
    }
    setTimeout(step, 300);
  });
}
