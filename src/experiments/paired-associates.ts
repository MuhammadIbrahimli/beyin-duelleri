import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface PairSchedule { pairs: { digit: number; shape: number }[]; order: number[] }
const SYMBOLS6 = ["■", "▲", "✚", "◆", "★", "●"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Learn the pairs first: each digit goes with one shape. Then each digit is shown alone: tap its shape. */
export default function play(root: HTMLElement, schedule: PairSchedule): Promise<{ choices: number[] }> {
  return new Promise((resolve) => {
    const choices: number[] = [];
    const dots = h("div", { class: "dots" });
    const cue = h("div", { class: "pa-cue", "aria-live": "polite" });
    const pad = h("div", { class: "pa-pad" });
    const stage = h("div", { class: "stage" }, cue, pad);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    async function study() {
      dots.textContent = az.play.paStudy;
      for (const p of schedule.pairs) {
        cue.textContent = `${p.digit}  ${SYMBOLS6[p.shape]}`;
        await sleep(1500);
      }
      cue.textContent = "";
      await sleep(600);
      test(0);
    }

    function test(k: number) {
      if (k === schedule.order.length) return resolve({ choices });
      dots.textContent = t("play.progress", { n: k + 1, total: schedule.order.length });
      const p = schedule.pairs[schedule.order[k]];
      cue.textContent = String(p.digit);
      pad.replaceChildren(...SYMBOLS6.map((s, sh) => {
        const b = h("button", { class: "pa-shape", "aria-label": s }, s);
        b.addEventListener("pointerdown", () => { choices.push(sh); fx.tap(); setTimeout(() => test(k + 1), 300); });
        return b;
      }));
    }
    setTimeout(study, 300);
  });
}
