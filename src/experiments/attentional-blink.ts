import { h, mount } from "../dom";
import { az, t } from "../i18n";

export interface BlinkSchedule { trials: { stream: string[] }[] }
const ITEM_MS = 110;

/** Letters flash by. Two digits are hidden among them. Report the first digit, then the second. */
export default function play(root: HTMLElement, schedule: BlinkSchedule): Promise<{ reports: number[][] }> {
  return new Promise((resolve) => {
    const reports: number[][] = [];
    const total = schedule.trials.length;
    const dots = h("div", { class: "dots" });
    const flash = h("div", { class: "blink-flash", "aria-live": "off" });
    const ask = h("div", { class: "soft" });
    const pad = h("div", { class: "blink-pad" });
    const stage = h("div", { class: "stage" }, flash, ask, pad);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    async function trial(i: number) {
      if (i === total) return resolve({ reports });
      dots.textContent = t("play.progress", { n: i + 1, total });
      pad.replaceChildren();
      ask.textContent = "";
      for (const ch of schedule.trials[i].stream) {
        flash.textContent = ch;
        await sleep(ITEM_MS);
      }
      flash.textContent = "";
      const got: number[] = [];
      const ask2 = (step: number) => new Promise<void>((next) => {
        ask.textContent = step === 0 ? az.play.blinkAsk1 : az.play.blinkAsk2;
        pad.replaceChildren(...Array.from({ length: 10 }, (_, d) => {
          const b = h("button", { class: "btn blink-key", "aria-label": String(d) }, String(d));
          b.addEventListener("pointerdown", () => { got.push(d); next(); });
          return b;
        }));
      });
      await ask2(0);
      await ask2(1);
      reports.push(got);
      await sleep(400);
      return trial(i + 1);
    }
    setTimeout(() => trial(0), 400);
  });
}
