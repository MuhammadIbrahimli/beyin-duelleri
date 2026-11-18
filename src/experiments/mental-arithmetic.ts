import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface ArithSchedule { problems: string[] }

/** Short sums, differences and products. Type the answer and press OK. The time per problem is measured. */
export default function play(root: HTMLElement, schedule: ArithSchedule): Promise<{ answers: number[]; times: number[] }> {
  return new Promise((resolve) => {
    const answers: number[] = [], times: number[] = [];
    const total = schedule.problems.length;
    const dots = h("div", { class: "dots" });
    const problem = h("div", { class: "arith-problem" });
    const input = h("input", { class: "field arith-input", inputmode: "numeric", "aria-label": az.play.arAnswer, autocomplete: "off" }) as HTMLInputElement;
    const ok = h("button", { class: "btn primary block" }, az.play.arOk);
    const stage = h("div", { class: "stage" }, problem, input, ok);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0, shownAt = 0;
    const submit = () => {
      const v = input.value.trim();
      if (!/^-?\d+$/.test(v)) { input.focus(); return; }
      answers.push(Number(v));
      times.push(Math.round(performance.now() - shownAt));
      fx.tap();
      i++;
      if (i === total) return resolve({ answers, times });
      setTimeout(step, 200);
    };
    ok.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });

    function step() {
      dots.textContent = t("play.progress", { n: i + 1, total });
      problem.textContent = schedule.problems[i];
      input.value = "";
      input.focus();
      shownAt = performance.now();
    }
    setTimeout(step, 300);
  });
}
