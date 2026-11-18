import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";
import { rng } from "../../shared/rng";

export interface MotSchedule { trials: { targets: number[]; seed: number }[] }
const DOTS = 8, SHOW_MS = 1500, MOVE_MS = 5000, FRAME_MS = 33, SPEED = 0.9; // SPEED in percent of the field per frame

/** Yellow dots flash, then all dots look the same and move. When they stop, tap the ones that were yellow. */
export default function play(root: HTMLElement, schedule: MotSchedule): Promise<{ picks: number[][] }> {
  return new Promise((resolve) => {
    const picks: number[][] = [];
    const total = schedule.trials.length;
    const dots = h("div", { class: "dots" });
    const info = h("div", { class: "soft", "aria-live": "polite" });
    const field = h("div", { class: "mot-field" });
    const done = h("button", { class: "btn primary block" }, az.play.motDone);
    const stage = h("div", { class: "stage" }, info, field, done);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0, selected: Set<number> = new Set();
    const els: HTMLElement[] = [];
    const pos: { x: number; y: number; vx: number; vy: number }[] = [];

    function place(seed: number) {
      const r = rng(seed);
      pos.length = 0;
      els.length = 0;
      field.replaceChildren();
      for (let k = 0; k < DOTS; k++) {
        const x = 10 + r() * 80, y = 10 + r() * 80;
        const a = r() * Math.PI * 2;
        pos.push({ x, y, vx: Math.cos(a) * SPEED, vy: Math.sin(a) * SPEED });
        const el = h("button", { class: "mot-dot", "aria-label": String(k + 1) });
        el.style.left = `${x}%`;
        el.style.top = `${y}%`;
        el.addEventListener("pointerdown", () => toggle(k));
        els.push(el);
        field.append(el);
      }
    }

    function toggle(k: number) {
      if (!els[k].classList.contains("pickable")) return;
      if (selected.has(k)) selected.delete(k); else selected.add(k);
      els[k].classList.toggle("picked", selected.has(k));
    }

    function move(): Promise<void> {
      return new Promise((res) => {
        const end = Date.now() + MOVE_MS;
        const id = window.setInterval(() => {
          for (let k = 0; k < DOTS; k++) {
            const p = pos[k];
            p.x += p.vx; p.y += p.vy;
            if (p.x < 4 || p.x > 92) { p.vx = -p.vx; p.x = Math.min(92, Math.max(4, p.x)); }
            if (p.y < 4 || p.y > 92) { p.vy = -p.vy; p.y = Math.min(92, Math.max(4, p.y)); }
            els[k].style.left = `${p.x}%`;
            els[k].style.top = `${p.y}%`;
          }
          if (Date.now() >= end) { clearInterval(id); res(); }
        }, FRAME_MS);

      });
    }

    async function trial() {
      if (i === total) return resolve({ picks });
      const tr = schedule.trials[i];
      dots.textContent = t("play.progress", { n: i + 1, total });
      selected = new Set();
      place(tr.seed);
      info.textContent = az.play.motWatch;
      tr.targets.forEach((k) => els[k].classList.add("target"));
      await new Promise((r) => setTimeout(r, SHOW_MS));
      els.forEach((el) => el.classList.remove("target"));
      info.textContent = az.play.motTrack;
      await move();
      els.forEach((el) => el.classList.add("pickable"));
      info.textContent = az.play.motPick;
      done.onclick = () => {
        picks.push([...selected].sort((a, b) => a - b));
        fx.tap();
        i++;
        setTimeout(trial, 300);
      };
    }

    setTimeout(trial, 400);
  });
}
