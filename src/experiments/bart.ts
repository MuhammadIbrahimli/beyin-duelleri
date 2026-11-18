import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface BartSchedule { explode: number[] }
const POINTS = 5, MAX = 32;

/** Pump the balloon for points. A pump may pop it, and then the points of that balloon are lost. Collect to keep them. */
export default function play(root: HTMLElement, schedule: BartSchedule): Promise<{ pumps: number[] }> {
  return new Promise((resolve) => {
    const pumps: number[] = [];
    const total = schedule.explode.length;
    const dots = h("div", { class: "dots" });
    const info = h("div", { class: "soft", "aria-live": "polite" });
    const balloon = h("div", { class: "bart-balloon" });
    const pump = h("button", { class: "btn opt-wide" }, az.play.pump);
    const collect = h("button", { class: "btn opt-wide" }, az.play.collect);
    const stage = h("div", { class: "stage" }, info, balloon, h("div", { class: "opts" }, pump, collect));
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0, count = 0, banked = 0, busy = false;
    const size = () => 70 + count * 6;

    function draw() {
      balloon.style.width = balloon.style.height = `${size()}px`;
      balloon.textContent = String(count);
      info.textContent = t("play.bartBanked", { n: banked });
    }

    function finishBalloon(collected: boolean) {
      busy = true;
      pumps.push(count);
      if (collected) { banked += count * POINTS; fx.good(); } else fx.bad();
      i++;
      if (i === total) return resolve({ pumps });
      setTimeout(begin, 600);
    }

    function begin() {
      count = 0;
      busy = false;
      dots.textContent = t("play.progress", { n: i + 1, total });
      balloon.classList.remove("popped");
      draw();
    }

    pump.addEventListener("pointerdown", () => {
      if (busy) return;
      count++;
      fx.tap();
      if (count === schedule.explode[i]) {
        // popped: the balloon is gone, its points are lost
        balloon.classList.add("popped");
        balloon.textContent = "💥";
        busy = true;
        setTimeout(() => finishBalloon(false), 500);
        return;
      }
      draw();
      if (count >= MAX) finishBalloon(true);
    });
    collect.addEventListener("pointerdown", () => { if (!busy && count > 0) finishBalloon(true); else if (!busy) fx.bad(); });
    setTimeout(begin, 300);
  });
}
