import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface FlickerSchedule { trials: number; startHz: number }

/** A light flickers. Each time, the rate drops a little. Tap when it looks steady. Three rounds. */
export default function play(root: HTMLElement, schedule: FlickerSchedule): Promise<{ thresholds: number[] }> {
  return new Promise((resolve) => {
    const thresholds: number[] = [];
    const dots = h("div", { class: "dots" });
    const light = h("div", { class: "fk-light" });
    const steady = h("button", { class: "btn primary block" }, az.play.flSteady);
    const stage = h("div", { class: "stage" }, h("p", { class: "soft" }, az.play.flAsk), light, steady);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let round = 0, hz = schedule.startHz, timer = 0, on = false, falling: ReturnType<typeof setInterval> | null = null;
    const blink = () => {
      on = !on;
      light.classList.toggle("on", on);
    };
    const startFlicker = () => {
      if (timer) clearInterval(timer);
      timer = window.setInterval(blink, 500 / hz); // half a period per change
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = 0;
      if (falling) clearInterval(falling);
      falling = null;
      light.classList.remove("on");
    };
    steady.addEventListener("pointerdown", () => {
      if (!falling) return;
      thresholds.push(hz);
      fx.tap();
      stop();
      round++;
      if (round === schedule.trials) return resolve({ thresholds });
      setTimeout(begin, 800);
    });
    function begin() {
      dots.textContent = t("play.progress", { n: round + 1, total: schedule.trials });
      hz = schedule.startHz;
      startFlicker();
      falling = setInterval(() => {
        hz = Math.max(1, hz - 1);
        startFlicker();
        if (hz <= 1) { thresholds.push(1); stop(); round++; if (round === schedule.trials) return resolve({ thresholds }); setTimeout(begin, 800); }
      }, 400);
    }
    setTimeout(begin, 400);
  });
}
