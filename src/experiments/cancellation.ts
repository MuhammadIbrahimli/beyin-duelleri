import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface CancelSchedule { grid: string[] }
const SECONDS = 30;

/** A grid of letters. Tap every letter E as fast as you can. Wrong taps cost you. */
export default function play(root: HTMLElement, schedule: CancelSchedule): Promise<{ taps: number[] }> {
  return new Promise((resolve) => {
    const taps: number[] = [];
    const info = h("div", { class: "soft" }, t("play.cancelTarget", { letter: "E" }));
    const timer = h("div", { class: "dots" }, String(SECONDS));
    const grid = h("div", { class: "cx-grid" });
    const cells = schedule.grid.map((letter, k) => {
      const b = h("button", { class: "cx-cell", "aria-label": String(k + 1) }, letter);
      b.addEventListener("pointerdown", () => {
        if (taps.includes(k) || done) return;
        taps.push(k);
        b.classList.add("marked");
        fx.tap();
      });
      return b;
    });
    grid.replaceChildren(...cells);
    const finishBtn = h("button", { class: "btn primary block" }, az.play.cancelDone);
    const stage = h("div", { class: "stage" }, info, grid, finishBtn);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, timer, stage));

    let done = false, left = SECONDS;
    const end = () => {
      if (done) return;
      done = true;
      clearInterval(id);
      resolve({ taps });
    };
    const id = window.setInterval(() => {
      left--;
      timer.textContent = String(left);
      if (left <= 0) end();
    }, 1000);
    finishBtn.addEventListener("click", end);
  });
}
