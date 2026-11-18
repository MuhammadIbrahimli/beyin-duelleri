import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";
import { rng } from "../../shared/rng";

export interface IbSchedule { trials: { surprise: boolean; shape: number; seed: number }[] }
const MOVE_MS = 6000, SURPRISE_AT = 3000, SURPRISE_MS = 1200, FRAME = 40, SHAPES = ["■", "▲", "✚", "◆"];

/** White circles move about. Keep count of them in your head. Afterwards: did you see anything unusual? */
export default function play(root: HTMLElement, schedule: IbSchedule): Promise<{ answers: { seen: boolean; shape: number }[] }> {
  return new Promise((resolve) => {
    const answers: { seen: boolean; shape: number }[] = [];
    const total = schedule.trials.length;
    const dots = h("div", { class: "dots" });
    const field = h("div", { class: "ib-field" });
    const ask = h("div", { class: "soft" });
    const opts = h("div", { class: "opts" });
    const stage = h("div", { class: "stage" }, field, ask, opts);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0;
    function move(tr: IbSchedule["trials"][number]): Promise<void> {
      const r = rng(tr.seed);
      const pos = Array.from({ length: 5 }, () => ({ x: r() * 90, y: r() * 90, vx: (r() - 0.5) * 2, vy: (r() - 0.5) * 2 }));
      const els = pos.map(() => { const e = h("span", { class: "ib-disc" }); field.append(e); return e; });
      const surprise = h("span", { class: "ib-surprise", style: "display:none" }, SHAPES[tr.shape]);
      field.append(surprise);
      return new Promise((res) => {
        const start = Date.now();
        const id = window.setInterval(() => {
          const el = Date.now() - start;
          pos.forEach((p, k) => {
            p.x += p.vx; p.y += p.vy;
            if (p.x < 0 || p.x > 90) p.vx = -p.vx;
            if (p.y < 0 || p.y > 90) p.vy = -p.vy;
            els[k].style.left = `${p.x}%`;
            els[k].style.top = `${p.y}%`;
          });
          if (tr.surprise && el >= SURPRISE_AT && el < SURPRISE_AT + SURPRISE_MS) {
            surprise.style.display = "";
            surprise.style.left = `${((el - SURPRISE_AT) / SURPRISE_MS) * 90}%`;
            surprise.style.top = "70%";
          } else surprise.style.display = "none";
          if (el >= MOVE_MS) { clearInterval(id); res(); }
        }, FRAME);
      });
    }

    function question() {
      ask.textContent = az.play.incAsk;
      opts.replaceChildren(
        h("button", { class: "btn opt-wide", onclick: () => seen(false) }, az.play.incNo),
        h("button", { class: "btn opt-wide", onclick: () => seen(true) }, az.play.incYes),
      );
    }
    function seen(v: boolean) {
      if (!v) { answers.push({ seen: false, shape: -1 }); return next(); }
      ask.textContent = az.play.incShape;
      opts.replaceChildren(...SHAPES.map((s, k) => h("button", { class: "btn ib-shape", onclick: () => { answers.push({ seen: true, shape: k }); next(); } }, s)));
    }
    function next() {
      fx.tap();
      i++;
      setTimeout(step, 400);
    }

    async function step() {
      if (i === total) return resolve({ answers });
      dots.textContent = t("play.progress", { n: i + 1, total });
      field.replaceChildren();
      opts.replaceChildren();
      ask.textContent = az.play.incWatch;
      await move(schedule.trials[i]);
      field.replaceChildren();
      question();
    }
    setTimeout(step, 400);
  });
}
