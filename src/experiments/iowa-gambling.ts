import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface IowaSchedule { outcomes: Record<"A" | "B" | "C" | "D", number[]> }
const DECKS = ["A", "B", "C", "D"] as const;

/** Four decks of cards. Each card gives money, sometimes taken back. Learn which decks pay in the long run. */
export default function play(root: HTMLElement, schedule: IowaSchedule): Promise<{ choices: number[] }> {
  return new Promise((resolve) => {
    const choices: number[] = [];
    const total = schedule.outcomes.A.length;
    let i = 0, sum = 0;
    const dots = h("div", { class: "dots" });
    const total_el = h("div", { class: "iowa-total", "aria-live": "polite" });
    const result = h("div", { class: "iowa-result", "aria-live": "polite" });
    const decks = DECKS.map((d, k) => {
      const b = h("button", { class: "iowa-deck", "aria-label": d }, d);
      b.addEventListener("pointerdown", () => pick(k));
      return b;
    });
    const stage = h("div", { class: "stage" }, total_el, result, h("div", { class: "iowa-decks" }, ...decks), h("p", { class: "soft" }, az.play.iowaAsk));
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    const show = () => {
      dots.textContent = t("play.progress", { n: i + 1, total });
      total_el.textContent = t("play.iowaTotal", { n: sum });
    };

    function pick(k: number) {
      if (i === total) return;
      const v = schedule.outcomes[DECKS[k]][i];
      choices.push(k);
      sum += v;
      result.textContent = v >= 0 ? `+${v}` : `−${Math.abs(v)}`;
      result.className = `iowa-result ${v >= 0 ? "gain" : "loss"}`;
      if (v >= 0) fx.good(); else fx.bad();
      i++;
      if (i === total) {
        setTimeout(() => resolve({ choices }), 500);
        return;
      }
      show();
    }
    show();
  });
}
