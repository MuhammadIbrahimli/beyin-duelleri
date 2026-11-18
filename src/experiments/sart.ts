import { h, mount } from "../dom";
import { az, t } from "../i18n";

export interface SartSchedule { digits: number[] }
const STEP_MS = 1000;      // each digit on screen; a tap during it counts as a response
const BLANK_MS = 150;

/** Digits one after another. Tap on every digit except the 3. Resolves with one tap flag per digit. */
export default function play(root: HTMLElement, schedule: SartSchedule): Promise<{ taps: boolean[] }> {
  return new Promise((resolve) => {
    const taps: boolean[] = [];
    const total = schedule.digits.length;
    const dots = h("div", { class: "dots" });
    const digit = h("div", { class: "sart-digit", "aria-live": "off" });
    const hint = h("p", { class: "soft" }, az.play.sartAsk);
    const stage = h("div", { class: "stage sart-stage" }, hint, digit);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0, tapped = false, shown = false;
    stage.addEventListener("pointerdown", () => { if (shown && !tapped) tapped = true; });

    function step() {
      if (i === total) return resolve({ taps });
      dots.textContent = t("play.progress", { n: i + 1, total });
      digit.textContent = String(schedule.digits[i]);
      tapped = false;
      shown = true;
      setTimeout(() => {
        shown = false;
        taps.push(tapped);
        digit.textContent = "";
        i++;
        setTimeout(step, BLANK_MS);
      }, STEP_MS);
    }
    setTimeout(step, 500);
  });
}
