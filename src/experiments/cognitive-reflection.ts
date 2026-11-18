import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface ReflectionSchedule { items: string[][] }

/** Short questions. Answer quickly, but each answer should be checked: the first one that comes to mind is often wrong. */
export default function play(root: HTMLElement, schedule: ReflectionSchedule): Promise<{ answers: number[] }> {
  return new Promise((resolve) => {
    const answers: number[] = [];
    const total = schedule.items.length;
    const dots = h("div", { class: "dots" });
    const question = h("p", { class: "refl-q" });
    const opts = h("div", { class: "refl-opts" });
    const stage = h("div", { class: "stage" }, question, opts);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0;
    function step() {
      if (i === total) return resolve({ answers });
      dots.textContent = t("play.progress", { n: i + 1, total });
      question.textContent = az.reflection.items[i];
      opts.replaceChildren(...schedule.items[i].map((label, k) => {
        const b = h("button", { class: "btn opt-wide refl-opt" }, label);
        b.addEventListener("pointerdown", () => {
          answers.push(k);
          fx.tap();
          i++;
          setTimeout(step, 250);
        });
        return b;
      }));
    }
    setTimeout(step, 300);
  });
}
