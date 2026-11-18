import { h, mount } from "../dom";
import { fx } from "../fx";
import { az } from "../i18n";
import { PVT_LAPSE_MS } from "../../shared/tasks-more";

export interface PvtSchedule { foreperiods: number[] }

/** A dot appears after a random wait. Tap as soon as it shows. Tapping while waiting is a false start and repeats the wait. */
export default function play(root: HTMLElement, schedule: PvtSchedule): Promise<{ times: (number | null)[]; falseStarts: number }> {
  return new Promise((resolve) => {
    const times: (number | null)[] = [];
    let falseStarts = 0, i = 0, shownAt = 0, timer = 0, timeout = 0;
    const msg = h("div", { class: "soft", "aria-live": "polite" });
    const area = h("div", { class: "pvt-area" });
    const stage = h("div", { class: "stage pvt-stage" }, msg, area);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, stage));

    const done = (rt: number | null) => {
      times.push(rt);
      if (rt === null) fx.bad(); else fx.good();
      area.replaceChildren();
      stage.onpointerdown = null;
      i++;
      if (i === schedule.foreperiods.length) return resolve({ times, falseStarts });
      setTimeout(wait, 800);
    };

    function show() {
      msg.textContent = az.play.pvtGo;
      area.replaceChildren(h("div", { class: "pvt-dot" }));
      requestAnimationFrame(() => {
        shownAt = performance.now();
        timer = window.setTimeout(() => done(null), PVT_LAPSE_MS);
      });
      stage.onpointerdown = () => done(Math.round(performance.now() - shownAt));
    }

    function wait() {
      msg.textContent = az.play.pvtWait;
      area.replaceChildren();
      timeout = window.setTimeout(show, schedule.foreperiods[i]);
      stage.onpointerdown = () => {
        falseStarts++;
        clearTimeout(timeout);
        fx.bad();
        msg.textContent = az.play.pvtFalse;
        stage.onpointerdown = null;
        setTimeout(wait, 900);
      };
    }
    void timer;
    setTimeout(wait, 500);
  });
}
