import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface BisectSchedule { lines: { x1: number; x2: number }[] }

/** A horizontal line appears. Tap where you think its middle is. */
export default function play(root: HTMLElement, schedule: BisectSchedule): Promise<{ taps: number[] }> {
  return new Promise((resolve) => {
    const taps: number[] = [];
    const total = schedule.lines.length;
    const dots = h("div", { class: "dots" });
    const field = h("div", { class: "bis-field", "aria-label": az.play.bisectAsk });
    const line = h("div", { class: "bis-line" });
    field.append(line);
    const stage = h("div", { class: "stage" }, h("p", { class: "soft" }, az.play.bisectAsk), field);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0, answering = false;
    field.addEventListener("pointerdown", (e) => {
      if (!answering) return;
      const rect = field.getBoundingClientRect();
      const pct = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
      taps.push(Math.round(pct * 10) / 10);
      answering = false;
      fx.tap();
      i++;
      setTimeout(step, 350);
    });

    function step() {
      if (i === total) return resolve({ taps });
      dots.textContent = t("play.progress", { n: i + 1, total });
      const l = schedule.lines[i];
      line.style.left = `${l.x1}%`;
      line.style.width = `${l.x2 - l.x1}%`;
      answering = true;
    }
    setTimeout(step, 300);
  });
}
