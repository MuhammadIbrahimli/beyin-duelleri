import { h, mount } from "../dom";
import { t } from "../i18n/az";

export interface RefleksSchedule { delays: number[] }
const MAX_EARLY = 3; // same limit as the server; further early taps are ignored, not punished

/** Resolves with the payload the server expects: { times, earlyTaps }. */
export default function play(root: HTMLElement, schedule: RefleksSchedule): Promise<{ times: number[]; earlyTaps: number }> {
  return new Promise((resolve) => {
    const times: number[] = [];
    const total = schedule.delays.length;
    let early = 0;

    const dots = h("div", { class: "dots" });
    const label = h("div", { class: "big" });
    const sub = h("div", { class: "soft" });
    const stage = h("div", { class: "stage wait" }, label, sub);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    const showDots = () => (dots.textContent = t("play.progress", { n: times.length + 1, total }));

    function round() {
      showDots();
      stage.className = "stage wait";
      label.textContent = t("play.wait");
      const delay = schedule.delays[times.length];
      let goAt = 0, greenAt = 0, raf = 0, state: "wait" | "go" | "pause" = "wait";

      const start = performance.now();
      goAt = start + delay;
      const tick = (now: number) => {
        if (state !== "wait") return;
        if (now >= goAt) {
          // paint green and stamp the time inside the same frame callback
          stage.className = "stage go";
          label.textContent = t("play.now");
          sub.textContent = "";
          greenAt = performance.now();
          state = "go";
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      stage.onpointerdown = () => {
        const now = performance.now();
        if (state === "go") {
          times.push(Math.round(now - greenAt));
          state = "pause";
          stage.onpointerdown = null;
          if (times.length === total) { resolve({ times, earlyTaps: early }); return; }
          setTimeout(round, 400);
        } else if (state === "wait" && early < MAX_EARLY) {
          cancelAnimationFrame(raf);
          early++;
          state = "pause";
          stage.className = "stage early";
          label.textContent = "";
          sub.textContent = t("play.tooEarly");
          stage.onpointerdown = null;
          setTimeout(round, 1200); // same round, same delay
        }
      };
    }
    round();
  });
}
