import { h, mount } from "../dom";
import { fx } from "../fx";
import { az } from "../i18n";

export interface RhythmSchedule { beats: number; intervalMs: number }

/** A light flashes on a steady beat. Tap in time with it, on every flash. */
export default function play(root: HTMLElement, schedule: RhythmSchedule): Promise<{ taps: number[] }> {
  return new Promise((resolve) => {
    const taps: number[] = [];
    const light = h("div", { class: "rh-light" });
    const pad = h("button", { class: "rh-pad" }, az.play.rhythmTap);
    const stage = h("div", { class: "stage" }, h("p", { class: "soft" }, az.play.rhythmAsk), light, pad);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, stage));

    let t0 = 0, beat = 0;
    pad.addEventListener("pointerdown", () => {
      if (!t0) return;
      taps.push(Math.round(performance.now() - t0));
      fx.tap();
    });
    const flash = () => {
      if (beat === schedule.beats) {
        setTimeout(() => resolve({ taps }), schedule.intervalMs);
        return;
      }
      beat++;
      light.classList.add("on");
      setTimeout(() => light.classList.remove("on"), 120);
      if (beat === 1) t0 = performance.now() - schedule.intervalMs; // beat k is at (k+1)*interval after t0
      setTimeout(flash, schedule.intervalMs);
    };
    setTimeout(flash, 500);
  });
}
