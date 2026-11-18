import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface SyllogismSchedule { items: { premises: string[]; conclusion: string }[] }

/** Premises and a conclusion written in symbols. Does the conclusion follow necessarily? Answer yes or no. */
export default function play(root: HTMLElement, schedule: SyllogismSchedule): Promise<{ answers: boolean[] }> {
  return new Promise((resolve) => {
    const answers: boolean[] = [];
    const total = schedule.items.length;
    const dots = h("div", { class: "dots" });
    const body = h("div", { class: "syl-body" });
    const yes = h("button", { class: "btn opt-wide" }, az.play.syllogYes);
    const no = h("button", { class: "btn opt-wide" }, az.play.syllogNo);
    const stage = h("div", { class: "stage" }, body, h("p", { class: "soft" }, az.play.syllogAsk), h("div", { class: "opts" }, yes, no));
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0;
    const answer = (v: boolean) => {
      answers.push(v);
      fx.tap();
      i++;
      setTimeout(step, 250);
    };
    yes.addEventListener("pointerdown", () => answer(true));
    no.addEventListener("pointerdown", () => answer(false));

    function step() {
      if (i === total) return resolve({ answers });
      const it = schedule.items[i];
      dots.textContent = t("play.progress", { n: i + 1, total });
      body.replaceChildren(
        ...it.premises.map((p) => h("p", { class: "syl-line" }, p)),
        h("hr", { class: "syl-rule" }),
        h("p", { class: "syl-line syl-concl" }, it.conclusion),
      );
    }
    setTimeout(step, 300);
  });
}
