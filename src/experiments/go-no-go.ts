import { h, mount } from "../dom";
import { fx } from "../fx";
import { t } from "../i18n";

export interface GngSchedule { trials: { go: boolean; gapMs: number }[] }
const SHOW_MS = 900; // how long each shape stays on screen: the reaction window

/** Resolves with { taps }: the reaction time in ms for every trial, or null where the player did not tap. */
export default function play(root: HTMLElement, schedule: GngSchedule): Promise<{ taps: (number | null)[] }> {
  return new Promise((resolve) => {
    const taps: (number | null)[] = [];
    const total = schedule.trials.length;
    const dots = h("div", { class: "dots" });
    const arena = h("div", { class: "gng-arena", style: "height:160px" });
    const stage = h("div", { class: "stage" }, arena);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0;
    function trial() {
      if (i === total) return resolve({ taps });
      const tr = schedule.trials[i];
      dots.textContent = t("play.progress", { n: i + 1, total });
      let shownAt = 0, answered = false, timer = 0;

      const shape = h("div", { class: "gng-shape pop " + (tr.go ? "go" : "nogo") });
      const finish = (rt: number | null) => {
        if (answered) return;
        answered = true;
        clearTimeout(timer);
        stage.onpointerdown = null;
        taps.push(rt);
        if (rt !== null) { if (tr.go) fx.good(); else { fx.bad(); stage.classList.add("flash-bad"); setTimeout(() => stage.classList.remove("flash-bad"), 280); } }
        shape.remove();
        i++;
        setTimeout(trial, tr.gapMs);
      };

      arena.replaceChildren(shape);
      // stamp the reaction clock on the frame where the shape is actually painted
      requestAnimationFrame(() => {
        shownAt = performance.now();
        timer = window.setTimeout(() => finish(null), SHOW_MS);
      });
      stage.onpointerdown = () => { if (shownAt) finish(Math.round(performance.now() - shownAt)); };
    }
    setTimeout(trial, 700);
  });
}
