import { h, mount } from "../dom";
import { fx } from "../fx";
import { az } from "../i18n";

export interface ClockSchedule { jumps: number[] }
const STEPS = 40, STEP_MS = 900, POS = 12;

/** A pointer moves round a clock. Now and then it jumps two positions instead of one. Tap the signal when that happens. */
export default function play(root: HTMLElement, schedule: ClockSchedule): Promise<{ taps: number[] }> {
  return new Promise((resolve) => {
    const taps: number[] = [];
    const face = h("div", { class: "vc-face" });
    const marks = Array.from({ length: POS }, (_, k) => {
      const a = (k / POS) * Math.PI * 2 - Math.PI / 2;
      const m = h("span", { class: "vc-mark" });
      m.style.left = `${50 + Math.cos(a) * 42}%`;
      m.style.top = `${50 + Math.sin(a) * 42}%`;
      face.append(m);
      return m;
    });
    const pointer = h("span", { class: "vc-pointer" });
    face.append(pointer);
    const signal = h("button", { class: "btn primary block" }, az.play.vigilSignal);
    const stage = h("div", { class: "stage" }, h("p", { class: "soft" }, az.play.vigilAsk), face, signal);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, stage));

    let step = 0, pos = 0, timer = 0;
    const draw = () => {
      const a = (pos / POS) * Math.PI * 2 - Math.PI / 2;
      pointer.style.left = `${50 + Math.cos(a) * 30}%`;
      pointer.style.top = `${50 + Math.sin(a) * 30}%`;
      marks.forEach((m, k) => m.classList.toggle("on", k === pos));
    };
    signal.addEventListener("pointerdown", () => { taps.push(Math.max(0, step - 1)); fx.tap(); });

    const tick = () => {
      if (step === STEPS) return resolve({ taps });
      pos = (pos + (schedule.jumps.includes(step) ? 2 : 1)) % POS;
      draw();
      step++;
      timer = window.setTimeout(tick, STEP_MS);
    };
    void timer;
    setTimeout(tick, 400);
  });
}
