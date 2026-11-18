import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface TimeSchedule { targets: number[] }

/** Press start, and press stop when you think the given time has passed. There is no clock on the screen. */
export default function play(root: HTMLElement, schedule: TimeSchedule): Promise<{ durations: number[] }> {
  return new Promise((resolve) => {
    const durations: number[] = [];
    const total = schedule.targets.length;
    const dots = h("div", { class: "dots" });
    const prompt = h("div", { class: "time-prompt", "aria-live": "polite" });
    const btn = h("button", { class: "btn primary block" });
    const stage = h("div", { class: "stage" }, prompt, btn);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0, startedAt = 0;
    function idle() {
      dots.textContent = t("play.progress", { n: i + 1, total });
      prompt.textContent = t("play.timeAsk", { s: schedule.targets[i] / 1000 });
      btn.textContent = az.play.timeStart;
      btn.onclick = () => { startedAt = performance.now(); running(); };
    }
    function running() {
      prompt.textContent = az.play.timeWait;
      btn.textContent = az.play.timeStop;
      btn.onclick = () => {
        durations.push(Math.round(performance.now() - startedAt));
        fx.tap();
        i++;
        if (i === total) return resolve({ durations });
        setTimeout(idle, 500);
      };
    }
    setTimeout(idle, 300);
  });
}
