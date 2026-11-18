import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface DsstSchedule { symbols: string[]; digits: number[] }
const TIMEOUT_MS = 4000;

/** A digit is shown; tap its symbol on the key. The key (digit to symbol) is shown on top and changes every run. */
export default function play(root: HTMLElement, schedule: DsstSchedule): Promise<{ choices: (string | null)[]; times: number[] }> {
  return new Promise((resolve) => {
    const choices: (string | null)[] = [], times: number[] = [];
    const total = schedule.digits.length;
    const dots = h("div", { class: "dots" });
    const key = h("div", { class: "dsst-key", "aria-label": az.play.dsstAsk },
      ...schedule.symbols.map((s, d) => h("span", null, h("b", null, String(d + 1)), " ", s)));
    const digit = h("div", { class: "dsst-digit" });
    const pad = h("div", { class: "dsst-pad" }, ...schedule.symbols.map((s) => h("button", { class: "btn dsst-btn", "data-s": s, "aria-label": s }, s)));
    const stage = h("div", { class: "stage" }, key, digit, pad);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0, shownAt = 0, answered = true, timer = 0;
    const answer = (choice: string | null) => {
      if (answered) return;
      answered = true;
      clearTimeout(timer);
      const expected = schedule.symbols[schedule.digits[i] - 1];
      choices.push(choice);
      times.push(choice === null ? TIMEOUT_MS : Math.round(performance.now() - shownAt));
      if (choice === expected) fx.tap(); else fx.bad();
      i++;
      setTimeout(step, 150);
    };
    pad.addEventListener("pointerdown", (e) => {
      const b = (e.target as HTMLElement).closest("button");
      if (b) answer(b.getAttribute("data-s"));
    });

    function step() {
      if (i === total) return resolve({ choices, times });
      dots.textContent = t("play.progress", { n: i + 1, total });
      digit.textContent = String(schedule.digits[i]);
      answered = false;
      requestAnimationFrame(() => {
        shownAt = performance.now();
        timer = window.setTimeout(() => answer(null), TIMEOUT_MS);
      });
    }
    setTimeout(step, 400);
  });
}
