import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";
import { rng } from "../../shared/rng";

export interface NumerositySchedule { trials: { n: number; seed: number }[] }
const SHOW_MS = 500;

/** A few dots flash on the field. Then say how many there were. */
export default function play(root: HTMLElement, schedule: NumerositySchedule): Promise<{ answers: number[] }> {
  return new Promise((resolve) => {
    const answers: number[] = [];
    const total = schedule.trials.length;
    const dots = h("div", { class: "dots" });
    const field = h("div", { class: "num-field" });
    const ask = h("div", { class: "soft" }, az.play.numAsk);
    const pad = h("div", { class: "num-pad" });
    const stage = h("div", { class: "stage" }, field, ask, pad);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    for (let n = 1; n <= 12; n++) {
      const b = h("button", { class: "btn num-key", "aria-label": String(n) }, String(n));
      b.addEventListener("pointerdown", () => answer(n));
      pad.append(b);
    }

    let i = 0, answering = false;
    const answer = (n: number) => {
      if (!answering) return;
      answering = false;
      answers.push(n);
      fx.tap();
      i++;
      setTimeout(step, 300);
    };

    /** Scatter n dots with a minimum distance, so that they are countable. */
    function place(n: number, seed: number) {
      const r = rng(seed);
      const pts: { x: number; y: number }[] = [];
      let guard = 0;
      while (pts.length < n && guard++ < 5000) {
        const x = 8 + r() * 84, y = 8 + r() * 84;
        if (pts.every((p) => Math.hypot(p.x - x, p.y - y) > 14)) pts.push({ x, y });
      }
      field.replaceChildren(...pts.map((p) => {
        const d = h("span", { class: "num-dot" });
        d.style.left = `${p.x}%`;
        d.style.top = `${p.y}%`;
        return d;
      }));
    }

    async function step() {
      if (i === total) return resolve({ answers });
      dots.textContent = t("play.progress", { n: i + 1, total });
      answering = false;
      const tr = schedule.trials[i];
      place(tr.n, tr.seed);
      await new Promise((r) => setTimeout(r, SHOW_MS));
      field.replaceChildren();
      answering = true;
    }
    setTimeout(step, 400);
  });
}
