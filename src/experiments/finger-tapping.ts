import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface TapSchedule { trials: number }
const TAP_MS = 10000;

/** Two rounds of ten seconds. Tap the button as fast as you can. The timer starts with the first tap. */
export default function play(root: HTMLElement, _schedule: TapSchedule): Promise<{ taps: number[] }> {
  return new Promise((resolve) => {
    const taps: number[] = [];
    const dots = h("div", { class: "dots" });
    const counter = h("div", { class: "tap-count", "aria-live": "polite" }, "0");
    const pad = h("button", { class: "tap-pad" }, az.play.tapGo) as HTMLButtonElement;
    const stage = h("div", { class: "stage" }, counter, pad);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let round = 0, n = 0, endAt = 0, timer = 0;
    function beginRound() {
      dots.textContent = t("play.progress", { n: round + 1, total: 2 });
      n = 0;
      counter.textContent = "0";
      pad.textContent = az.play.tapGo;
      pad.disabled = false;
      pad.onpointerdown = onTap;
    }
    function onTap() {
      if (!endAt) {
        endAt = Date.now() + TAP_MS;
        timer = window.setTimeout(finishRound, TAP_MS);
      }
      n++;
      counter.textContent = String(n);
      fx.tap();
    }
    function finishRound() {
      clearTimeout(timer);
      taps.push(n);
      endAt = 0;
      round++;
      pad.onpointerdown = null;
      pad.disabled = true;
      if (round === 2) return resolve({ taps });
      pad.textContent = az.play.tapRest;
      setTimeout(beginRound, 2500);
    }
    setTimeout(beginRound, 300);
  });
}
