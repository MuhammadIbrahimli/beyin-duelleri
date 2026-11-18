import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface DigitBackwardSchedule { seqs: number[][] }
const ON_MS = 700, OFF_MS = 250;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Digits are shown one by one; then type them in REVERSE order. The answer is sent when all digits are typed. */
export default function play(root: HTMLElement, schedule: DigitBackwardSchedule): Promise<{ answers: number[][] }> {
  return new Promise((resolve) => {
    const answers: number[][] = [];
    const total = schedule.seqs.length;
    const dots = h("div", { class: "dots" });
    const shown = h("div", { class: "db-shown", "aria-live": "polite" });
    const status = h("div", { class: "soft" });
    const entered = h("div", { class: "db-entered" });
    const pad = h("div", { class: "db-pad" });
    const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => h("button", { class: "btn db-key", "aria-label": String(d) }, String(d)));
    const back = h("button", { class: "btn db-key", "aria-label": az.play.dbDelete }, az.play.dbDelete);
    pad.append(...keys, back);
    const stage = h("div", { class: "stage" }, status, shown, entered, pad);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let typing: number[] = [], want: number[] = [], accepting = false, idx = 0;
    const press = (d: number) => {
      if (!accepting) return;
      typing.push(d);
      entered.textContent = typing.join(" ");
      if (typing.length === want.length) {
        accepting = false;
        answers.push(typing);
        fx.tap();
        idx++;
        setTimeout(round, 500);
      }
    };
    keys.forEach((b, k) => b.addEventListener("pointerdown", () => press(k + 1)));
    back.addEventListener("pointerdown", () => { if (accepting && typing.length) { typing.pop(); entered.textContent = typing.join(" "); } });

    async function round() {
      if (idx === total) return resolve({ answers });
      dots.textContent = t("play.progress", { n: idx + 1, total });
      want = schedule.seqs[idx];
      typing = [];
      entered.textContent = "";
      accepting = false;
      status.textContent = az.play.dbWatch;
      pad.style.visibility = "hidden";
      await sleep(400);
      for (const d of want) {
        shown.replaceChildren(h("div", { class: "digit-big" }, String(d)));
        await sleep(ON_MS);
        shown.replaceChildren();
        await sleep(OFF_MS);
      }
      status.textContent = az.play.dbYour;
      pad.style.visibility = "visible";
      accepting = true;
    }
    void round();
  });
}
