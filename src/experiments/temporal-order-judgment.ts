import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface TojSchedule { trials: { soa: number; first: "left" | "right" }[] }
const FLASH_MS = 60;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Two flashes, one on the left and one on the right, a few milliseconds apart. Which one came first? */
export default function play(root: HTMLElement, schedule: TojSchedule): Promise<{ choices: string[] }> {
  return new Promise((resolve) => {
    const choices: string[] = [];
    const total = schedule.trials.length;
    const dots = h("div", { class: "dots" });
    const field = h("div", { class: "toj-field" });
    const left = h("div", { class: "toj-dot toj-left" });
    const right = h("div", { class: "toj-dot toj-right" });
    field.append(left, right);
    const bL = h("button", { class: "btn opt-wide" }, az.play.tojLeft);
    const bR = h("button", { class: "btn opt-wide" }, az.play.tojRight);
    const stage = h("div", { class: "stage" }, field, h("p", { class: "soft" }, az.play.tojAsk), h("div", { class: "opts" }, bL, bR));
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0, answering = false;
    const answer = (c: "left" | "right") => {
      if (!answering) return;
      answering = false;
      choices.push(c);
      fx.tap();
      i++;
      setTimeout(step, 500);
    };
    bL.addEventListener("pointerdown", () => answer("left"));
    bR.addEventListener("pointerdown", () => answer("right"));

    async function step() {
      if (i === total) return resolve({ choices });
      dots.textContent = t("play.progress", { n: i + 1, total });
      answering = false;
      const tr = schedule.trials[i];
      const firstLeft = tr.first === "left";
      const first = firstLeft ? left : right, second = firstLeft ? right : left;
      left.classList.remove("on"); right.classList.remove("on");
      await sleep(400);
      first.classList.add("on");
      await sleep(tr.soa);
      second.classList.add("on");
      await sleep(FLASH_MS);
      left.classList.remove("on"); right.classList.remove("on");
      answering = true;
    }
    setTimeout(step, 300);
  });
}
