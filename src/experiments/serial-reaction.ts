import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface SrtSchedule { items: number[]; kinds: ("seq" | "rand")[] }
const TIMEOUT_MS = 1500;

/** Four pads. One lights up; tap it as fast as you can. Some positions repeat in an order you will not be told about. */
export default function play(root: HTMLElement, schedule: SrtSchedule): Promise<{ choices: (number | null)[]; times: number[] }> {
  return new Promise((resolve) => {
    const choices: (number | null)[] = [], times: number[] = [];
    const total = schedule.items.length;
    const dots = h("div", { class: "dots" });
    const pads = [0, 1, 2, 3].map((k) => {
      const b = h("button", { class: "srt-pad", "aria-label": String(k + 1) });
      b.addEventListener("pointerdown", () => answer(k));
      return b;
    });
    const stage = h("div", { class: "stage" }, h("p", { class: "soft" }, az.play.srtAsk), h("div", { class: "srt-row" }, ...pads));
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0, shownAt = 0, answered = true, timer = 0;
    function answer(k: number | null) {
      if (answered) return;
      answered = true;
      clearTimeout(timer);
      choices.push(k);
      times.push(k === null ? TIMEOUT_MS : Math.round(performance.now() - shownAt));
      pads.forEach((p) => p.classList.remove("lit"));
      if (k === schedule.items[i]) fx.tap(); else fx.bad();
      i++;
      setTimeout(step, 250);
    }
    function step() {
      if (i === total) return resolve({ choices, times });
      dots.textContent = t("play.progress", { n: i + 1, total });
      answered = false;
      pads[schedule.items[i]].classList.add("lit");
      requestAnimationFrame(() => {
        shownAt = performance.now();
        timer = window.setTimeout(() => answer(null), TIMEOUT_MS);
      });
    }
    setTimeout(step, 400);
  });
}
