import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface MotorSchedule { seqs: number[][] }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Four pads light up in an order. Watch it, then press the same pads in the same order from memory. */
export default function play(root: HTMLElement, schedule: MotorSchedule): Promise<{ answers: number[][]; times: number[] }> {
  return new Promise((resolve) => {
    const answers: number[][] = [], times: number[] = [];
    const total = schedule.seqs.length;
    const dots = h("div", { class: "dots" });
    const status = h("div", { class: "soft", "aria-live": "polite" });
    const pads = [0, 1, 2, 3].map((k) => {
      const b = h("button", { class: "ms-pad", "aria-label": String(k + 1) });
      b.addEventListener("pointerdown", () => press(k));
      return b;
    });
    const stage = h("div", { class: "stage" }, status, h("div", { class: "ms-row" }, ...pads));
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0, typed: number[] = [], startAt = 0, accepting = false;
    const press = (k: number) => {
      if (!accepting) return;
      typed.push(k);
      fx.tap();
      if (typed.length === schedule.seqs[i].length) {
        accepting = false;
        answers.push(typed);
        times.push(Math.round(performance.now() - startAt));
        i++;
        setTimeout(round, 500);
      }
    };
    async function round() {
      if (i === total) return resolve({ answers, times });
      dots.textContent = t("play.progress", { n: i + 1, total });
      typed = [];
      accepting = false;
      status.textContent = az.play.motorWatch;
      for (const p of schedule.seqs[i]) {
        pads[p].classList.add("lit");
        await sleep(550);
        pads[p].classList.remove("lit");
        await sleep(200);
      }
      status.textContent = az.play.motorRepeat;
      startAt = performance.now();
      accepting = true;
    }
    setTimeout(round, 400);
  });
}
