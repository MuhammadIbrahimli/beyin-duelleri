import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";
import { rng } from "../../shared/rng";

export interface MotionSchedule { trials: { dir: "left" | "right"; coherence: number; seed: number }[] }
const DOTS = 70, MOVE_MS = 1300, FRAME_MS = 33, STEP = 1.1; // STEP in percent of the field per frame

/** Dots drift. Most of them move together, the rest move at random. Say which way the common motion goes. */
export default function play(root: HTMLElement, schedule: MotionSchedule): Promise<{ choices: (string | null)[] }> {
  return new Promise((resolve) => {
    const choices: (string | null)[] = [];
    const total = schedule.trials.length;
    const dots = h("div", { class: "dots" });
    const field = h("div", { class: "rdm-field" });
    const ask = h("div", { class: "soft" }, az.play.motionAsk);
    const left = h("button", { class: "btn opt-wide" }, az.play.motionLeft);
    const right = h("button", { class: "btn opt-wide" }, az.play.motionRight);
    const stage = h("div", { class: "stage" }, field, ask, h("div", { class: "opts" }, left, right));
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0, answered = true;
    const answer = (c: "left" | "right") => {
      if (answered) return;
      answered = true;
      choices.push(c);
      fx.tap();
      i++;
      setTimeout(step, 300);
    };
    left.addEventListener("pointerdown", () => answer("left"));
    right.addEventListener("pointerdown", () => answer("right"));

    async function move(tr: MotionSchedule["trials"][number]): Promise<void> {
      const r = rng(tr.seed);
      const els: HTMLElement[] = [], pos: { x: number; y: number }[] = [];
      field.replaceChildren();
      for (let k = 0; k < DOTS; k++) {
        const x = r() * 100, y = r() * 100;
        pos.push({ x, y });
        const el = h("span", { class: "rdm-dot" });
        field.append(el);
        els.push(el);
      }
      const sign = tr.dir === "right" ? 1 : -1;
      return new Promise((res) => {
        const end = Date.now() + MOVE_MS;
        const id = window.setInterval(() => {
          for (let k = 0; k < DOTS; k++) {
            const p = pos[k];
            if (r() < tr.coherence) p.x += sign * STEP;           // the common motion
            else { const a = r() * Math.PI * 2; p.x += Math.cos(a) * STEP; p.y += Math.sin(a) * STEP; } // noise
            if (p.x < 0) p.x += 100; if (p.x > 100) p.x -= 100;
            if (p.y < 0) p.y += 100; if (p.y > 100) p.y -= 100;
            els[k].style.left = `${p.x}%`;
            els[k].style.top = `${p.y}%`;
          }
          if (Date.now() >= end) { clearInterval(id); res(); }
        }, FRAME_MS);
      });
    }

    async function step() {
      if (i === total) return resolve({ choices });
      dots.textContent = t("play.progress", { n: i + 1, total });
      answered = true;
      await move(schedule.trials[i]);
      field.replaceChildren();
      answered = false;
    }
    setTimeout(step, 400);
  });
}
