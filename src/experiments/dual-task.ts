import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface DualSchedule { trials: { digits: number[]; flashes: number[] }[] }
const STEPS = 8, STEP_MS = 800;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Digits appear one by one. Meanwhile a red dot may flash: tap it when you see it. Then type the digits. */
export default function play(root: HTMLElement, schedule: DualSchedule): Promise<{ digits: number[][]; caught: number[] }> {
  return new Promise((resolve) => {
    const digitsOut: number[][] = [], caughtOut: number[] = [];
    const total = schedule.trials.length;
    const dots = h("div", { class: "dots" });
    const stageDigit = h("div", { class: "dt-digit", "aria-live": "polite" });
    const flash = h("button", { class: "dt-flash", "aria-label": az.play.dualSignal, style: "visibility:hidden" });
    const entry = h("div", { class: "dt-entry" });
    const pad = h("div", { class: "dt-pad", style: "display:none" });
    const stage = h("div", { class: "stage" }, h("div", { class: "dt-field" }, stageDigit, flash), entry, pad);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let caughtNow = 0, typed: number[] = [], digitsNow: number[] = [], accepting = false;
    flash.addEventListener("pointerdown", () => { if (flash.style.visibility !== "hidden") { caughtNow++; flash.style.visibility = "hidden"; fx.tap(); } });
    [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach((d) => pad.append(h("button", { class: "btn dt-key" }, String(d))));
    pad.querySelectorAll("button").forEach((b, k) => b.addEventListener("pointerdown", () => { if (accepting) press(k + 1); }));
    const press = (d: number) => {
      typed.push(d);
      entry.textContent = typed.join(" ");
      if (typed.length === 4) {
        accepting = false;
        digitsOut.push(typed);
        caughtOut.push(caughtNow);
        pad.style.display = "none";
        entry.textContent = "";
        setTimeout(trial, 500, digitsOut.length);
      }
    };

    async function trial(i: number) {
      if (i === total) return resolve({ digits: digitsOut, caught: caughtOut });
      const tr = schedule.trials[i];
      dots.textContent = t("play.progress", { n: i + 1, total });
      caughtNow = 0; typed = []; digitsNow = tr.digits;
      for (let s = 0; s < STEPS; s++) {
        stageDigit.textContent = s % 2 === 0 ? String(digitsNow[s / 2] ?? "") : "";
        flash.style.visibility = tr.flashes.includes(s) ? "visible" : "hidden";
        await sleep(STEP_MS);
        flash.style.visibility = "hidden";
      }
      stageDigit.textContent = az.play.dualDigits;
      pad.style.display = "";
      accepting = true;
    }
    setTimeout(() => trial(0), 400);
  });
}
