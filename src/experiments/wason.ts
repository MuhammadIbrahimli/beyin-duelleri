import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface WasonSchedule { cards: number[][]; rules: [number, number][] }
const SYMBOLS6 = ["■", "▲", "✚", "◆", "★", "●"];

/** A rule: if the left shape is on one side, the right shape is on the other. Choose the cards that could show the rule to be false. */
export default function play(root: HTMLElement, schedule: WasonSchedule): Promise<{ picks: number[][] }> {
  return new Promise((resolve) => {
    const picks: number[][] = [];
    const total = schedule.cards.length;
    const dots = h("div", { class: "dots" });
    const rule = h("div", { class: "wa-rule" });
    const cards = h("div", { class: "wa-cards" });
    const done = h("button", { class: "btn primary block" }, az.play.waDone);
    const stage = h("div", { class: "stage" }, rule, h("p", { class: "soft" }, az.play.waAsk), cards, done);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0, chosen = new Set<number>();
    function show() {
      dots.textContent = t("play.progress", { n: i + 1, total });
      const [p, q] = schedule.rules[i];
      rule.textContent = t("play.waRule", { p: SYMBOLS6[p], q: SYMBOLS6[q] });
      chosen = new Set();
      cards.replaceChildren(...schedule.cards[i].map((s, k) => {
        const b = h("button", { class: "wa-card", "aria-label": String(k + 1) }, SYMBOLS6[s]);
        b.addEventListener("pointerdown", () => {
          if (chosen.has(k)) chosen.delete(k); else chosen.add(k);
          b.classList.toggle("on", chosen.has(k));
          fx.tap();
        });
        return b;
      }));
    }
    done.addEventListener("click", () => {
      picks.push([...chosen].sort((a, b) => a - b));
      i++;
      if (i === total) return resolve({ picks });
      show();
    });
    show();
  });
}
