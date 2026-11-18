import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface NbackSchedule { letters: string[] }
const STEP_MS = 2000; // one letter on screen; no answer in time counts as "no"

/** Letters one by one. Answer "yes" when the letter is the same as two letters before. Resolves with one boolean per letter. */
export default function play(root: HTMLElement, schedule: NbackSchedule): Promise<{ responses: boolean[] }> {
  return new Promise((resolve) => {
    const responses: boolean[] = [];
    const total = schedule.letters.length;
    const dots = h("div", { class: "dots" });
    const letter = h("div", { class: "nback-letter", "aria-live": "polite" });
    const yes = h("button", { class: "btn opt-wide" }, az.play.yes);
    const no = h("button", { class: "btn opt-wide" }, az.play.no);
    const stage = h("div", { class: "stage" }, letter, h("p", { class: "soft" }, az.play.nbackAsk), h("div", { class: "opts" }, yes, no));
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0, timer = 0, answered = true;
    const answer = (said: boolean) => {
      if (answered) return;
      answered = true;
      clearTimeout(timer);
      responses.push(said);
      const isTarget = i >= 2 && schedule.letters[i] === schedule.letters[i - 2];
      if (said === isTarget) fx.good(); else fx.bad();
      i++;
      setTimeout(step, 200);
    };
    yes.addEventListener("pointerdown", () => answer(true));
    no.addEventListener("pointerdown", () => answer(false));

    function step() {
      if (i === total) return resolve({ responses });
      dots.textContent = t("play.progress", { n: i + 1, total });
      letter.textContent = schedule.letters[i];
      answered = false;
      timer = window.setTimeout(() => answer(false), STEP_MS);
    }
    setTimeout(step, 600);
  });
}
