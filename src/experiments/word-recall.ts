import { h, mount } from "../dom";
import { fx } from "../fx";
import { az } from "../i18n";

export interface RecallSchedule { words: string[] }
const SHOW_MS = 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Words are shown one by one. Then write as many as you remember, in any order. Resolves with the typed words. */
export default function play(root: HTMLElement, schedule: RecallSchedule): Promise<{ words: string[] }> {
  return new Promise((resolve) => {
    const typed: string[] = [];
    const dots = h("div", { class: "dots" });
    const shown = h("div", { class: "wr-shown", "aria-live": "polite" });
    const status = h("div", { class: "soft" });
    const input = h("input", { class: "field wr-input", placeholder: az.play.wrWrite, "aria-label": az.play.wrWrite, autocomplete: "off", autocapitalize: "off" }) as HTMLInputElement;
    const list = h("div", { class: "wr-list" });
    const add = h("button", { class: "btn" }, az.play.wrAdd);
    const done = h("button", { class: "btn primary block" }, az.play.wrDone);
    const write = h("div", { class: "wr-write" }, h("div", { class: "pair-input" }, input, add), list, done);
    write.style.display = "none";
    const stage = h("div", { class: "stage" }, status, shown, write);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    const push = () => {
      const w = input.value.trim();
      if (!w || typed.includes(w)) { input.value = ""; return; }
      typed.push(w);
      list.append(h("span", { class: "wr-chip" }, w));
      input.value = "";
      fx.tap();
    };
    add.addEventListener("click", push);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); push(); } });
    done.addEventListener("click", () => resolve({ words: typed }));

    async function run() {
      dots.textContent = "";
      status.textContent = az.play.wrWatch;
      for (const w of schedule.words) {
        shown.replaceChildren(h("div", { class: "wr-word" }, w));
        await sleep(SHOW_MS);
        shown.replaceChildren();
        await sleep(150);
      }
      status.textContent = "";
      write.style.display = "";
      input.focus();
    }
    setTimeout(run, 400);
  });
}
