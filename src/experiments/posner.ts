import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface PosnerSchedule { trials: { side: "left" | "right"; cue: "left" | "right"; cond: "base" | "cost"; gapMs: number }[] }
const TIMEOUT_MS = 1500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A cue flashes on one side. Then the target appears, on the cued side or the other one. Tap the side where the target appeared. */
export default function play(root: HTMLElement, schedule: PosnerSchedule): Promise<{ choices: (string | null)[]; times: number[] }> {
  return new Promise((resolve) => {
    const choices: (string | null)[] = [], times: number[] = [];
    const total = schedule.trials.length;
    const dots = h("div", { class: "dots" });
    const leftHalf = h("button", { class: "posner-half", "aria-label": az.play.posnerLeft });
    const rightHalf = h("button", { class: "posner-half", "aria-label": az.play.posnerRight });
    const field = h("div", { class: "posner-field" }, leftHalf, rightHalf, h("span", { class: "posner-fix" }, "+"));
    const stage = h("div", { class: "stage" }, h("p", { class: "soft" }, az.play.posnerHint), field);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0, shownAt = 0, answered = true, timer = 0;
    const answer = (c: "left" | "right" | null) => {
      if (answered) return;
      answered = true;
      clearTimeout(timer);
      choices.push(c);
      times.push(c === null ? TIMEOUT_MS : Math.round(performance.now() - shownAt));
      fx.tap();
      clear();
      i++;
      setTimeout(step, 300);
    };
    leftHalf.addEventListener("pointerdown", () => answer("left"));
    rightHalf.addEventListener("pointerdown", () => answer("right"));

    const clear = () => field.querySelectorAll(".posner-mark").forEach((m) => m.remove());
    const mark = (side: "left" | "right", kind: "cue" | "target") => {
      const m = h("span", { class: `posner-mark ${kind} ${side}` }, kind === "cue" ? "▲" : "●");
      field.append(m);
    };

    async function step() {
      if (i === total) return resolve({ choices, times });
      const tr = schedule.trials[i];
      dots.textContent = t("play.progress", { n: i + 1, total });
      answered = true;
      clear();
      await sleep(300);
      mark(tr.cue, "cue");
      await sleep(250);
      clear();
      await sleep(tr.gapMs);
      mark(tr.side, "target");
      answered = false;
      requestAnimationFrame(() => {
        shownAt = performance.now();
        timer = window.setTimeout(() => answer(null), TIMEOUT_MS);
      });
    }
    setTimeout(step, 400);
  });
}
