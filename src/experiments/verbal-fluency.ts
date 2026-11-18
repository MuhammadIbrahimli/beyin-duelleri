import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface FluencySchedule { letter: string }
const SECONDS = 60;

/** One minute. Type as many words as you can that start with the letter. Each word goes into the list once. */
export default function play(root: HTMLElement, schedule: FluencySchedule): Promise<{ words: string[] }> {
  return new Promise((resolve) => {
    const words: string[] = [];
    const info = h("div", { class: "soft" }, t("play.fluAsk", { letter: schedule.letter.toLocaleUpperCase() }));
    const clock = h("div", { class: "dots" }, String(SECONDS));
    const input = h("input", { class: "field fl-input", placeholder: schedule.letter.toLocaleUpperCase(), "aria-label": az.play.fluAdd, autocomplete: "off", autocapitalize: "off" }) as HTMLInputElement;
    const add = h("button", { class: "btn" }, az.play.fluAdd);
    const count = h("div", { class: "soft" }, "0");
    const list = h("div", { class: "wr-list" });
    const done = h("button", { class: "btn primary block" }, az.play.fluDone);
    const stage = h("div", { class: "stage" }, info, h("div", { class: "pair-input" }, input, add), count, list, done);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, clock, stage));

    let finished = false, left = SECONDS;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearInterval(id);
      resolve({ words });
    };
    const push = () => {
      const w = input.value.trim();
      input.value = "";
      if (!w || finished) return;
      if (words.some((x) => x.toLocaleLowerCase() === w.toLocaleLowerCase())) return;
      words.push(w);
      list.append(h("span", { class: "wr-chip" }, w));
      count.textContent = String(words.length);
      fx.tap();
    };
    add.addEventListener("click", push);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); push(); } });
    done.addEventListener("click", finish);
    const id = window.setInterval(() => {
      left--;
      clock.textContent = String(left);
      if (left <= 0) finish();
    }, 1000);
    input.focus();
  });
}
