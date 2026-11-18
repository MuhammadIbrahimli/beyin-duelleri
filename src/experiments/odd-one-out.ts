import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface OddSchedule { trials: { items: { shape: number; colour: number; n: number }[] }[] }
const SYMBOLS6 = ["■", "▲", "✚", "◆", "★", "●"];
const COLOURS = ["#ff5a5f", "#4aa3ff", "#4cd483"];

/** Four groups of shapes. Three of them go together; one does not. Tap the odd one. */
export default function play(root: HTMLElement, schedule: OddSchedule): Promise<{ choices: number[] }> {
  return new Promise((resolve) => {
    const choices: number[] = [];
    const total = schedule.trials.length;
    const dots = h("div", { class: "dots" });
    const row = h("div", { class: "odd-row" });
    const stage = h("div", { class: "stage" }, h("p", { class: "soft" }, az.play.oddAsk), row);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0;
    function step() {
      if (i === total) return resolve({ choices });
      dots.textContent = t("play.progress", { n: i + 1, total });
      row.replaceChildren(...schedule.trials[i].items.map((it, k) => {
        const b = h("button", { class: "odd-item", "aria-label": String(k + 1) },
          ...Array.from({ length: it.n }, () => h("span", { style: `color:${COLOURS[it.colour]}` }, SYMBOLS6[it.shape])));
        b.addEventListener("pointerdown", () => {
          choices.push(k);
          fx.tap();
          i++;
          setTimeout(step, 300);
        });
        return b;
      }));
    }
    setTimeout(step, 300);
  });
}
