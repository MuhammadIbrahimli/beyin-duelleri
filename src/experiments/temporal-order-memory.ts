import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface TemporalSchedule { trials: { seq: number[]; pair: [number, number] }[] }
const SYMBOLS4 = ["■", "▲", "✚", "◆"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Three shapes come one after another. Then two of them are shown side by side: which one came first? */
export default function play(root: HTMLElement, schedule: TemporalSchedule): Promise<{ choices: number[] }> {
  return new Promise((resolve) => {
    const choices: number[] = [];
    const total = schedule.trials.length;
    const dots = h("div", { class: "dots" });
    const shown = h("div", { class: "to-shown", "aria-live": "polite" });
    const pick = h("div", { class: "to-pick" });
    const stage = h("div", { class: "stage" }, shown, pick);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    async function trial(i: number) {
      if (i === total) return resolve({ choices });
      const tr = schedule.trials[i];
      dots.textContent = t("play.progress", { n: i + 1, total });
      pick.replaceChildren();
      for (const s of tr.seq) {
        shown.textContent = SYMBOLS4[s];
        await sleep(900);
        shown.textContent = "";
        await sleep(300);
      }
      shown.textContent = az.play.toAsk;
      await new Promise<void>((next) => {
        pick.replaceChildren(...tr.pair.map((s, k) => {
          const b = h("button", { class: "btn to-btn" }, SYMBOLS4[s]);
          b.addEventListener("pointerdown", () => { choices.push(k); fx.tap(); next(); });
          return b;
        }));
      });
      await sleep(300);
      return trial(i + 1);
    }
    setTimeout(() => trial(0), 400);
  });
}
