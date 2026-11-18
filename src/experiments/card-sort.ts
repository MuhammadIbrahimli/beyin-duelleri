import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";
import { cellSvg } from "./matrix";

type Dim = "colour" | "shape" | "count";
export interface CardSchedule { keys: { colour: number; shape: number; count: number }[]; trials: { card: { colour: number; shape: number; count: number }; rule: Dim; prevRule: Dim | null; correct: number }[] }

/** A card is shown; pick one of three key cards. Right or wrong is the only hint. The sorting rule changes without warning. */
export default function play(root: HTMLElement, schedule: CardSchedule): Promise<{ choices: number[] }> {
  return new Promise((resolve) => {
    const choices: number[] = [];
    const total = schedule.trials.length;
    const dots = h("div", { class: "dots" });
    const card = h("div", { class: "cs-card" });
    const msg = h("div", { class: "soft", "aria-live": "polite" });
    const keyBtns = schedule.keys.map((k, i) => {
      const b = h("button", { class: "cs-key", "aria-label": String(i + 1) }, cellSvg({ n: k.count as 1 | 2 | 3, shape: k.shape as 0 | 1 | 2, colour: k.colour as 0 | 1 | 2 }, 80));
      b.addEventListener("pointerdown", () => answer(i));
      return b;
    });
    const stage = h("div", { class: "stage" }, card, msg, h("div", { class: "cs-keys" }, ...keyBtns));
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0, answered = true;
    function answer(k: number) {
      if (answered) return;
      answered = true;
      choices.push(k);
      const right = k === schedule.trials[i].correct;
      if (right) fx.good(); else fx.bad();
      msg.textContent = right ? az.play.cardRight : az.play.cardWrong;
      i++;
      setTimeout(step, 700);
    }

    function step() {
      if (i === total) return resolve({ choices });
      const tr = schedule.trials[i];
      dots.textContent = t("play.progress", { n: i + 1, total });
      card.replaceChildren(cellSvg({ n: tr.card.count as 1 | 2 | 3, shape: tr.card.shape as 0 | 1 | 2, colour: tr.card.colour as 0 | 1 | 2 }, 120));
      msg.textContent = az.play.cardAsk;
      answered = false;
    }
    setTimeout(step, 300);
  });
}
