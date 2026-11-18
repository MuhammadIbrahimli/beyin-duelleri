import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface DigitSchedule { seqs: number[][][] }
interface Attempt { digits: number[]; ms: number }
const MIN = 3, MAX = 12, ON = 700, OFF = 250;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default async function play(root: HTMLElement, schedule: DigitSchedule): Promise<{ attempts: Attempt[] }> {
  const title = h("div", { class: "dots" });
  const status = h("div", { class: "soft" });
  const shown = h("div", { class: "stage-body", style: "min-height:9rem;display:flex;align-items:center;justify-content:center" });
  const entered = h("div", { class: "entered" });
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d) =>
    h("button", { class: d === 0 ? "zero" : "", "aria-label": String(d), onpointerdown: () => onKey?.(d) }, String(d)));
  const pad = h("div", { class: "keypad", style: "visibility:hidden" }, ...keys);
  mount(root, h("div", { class: "screen full", style: "position:relative" }, title, h("div", { class: "stage" }, status, shown, entered, pad)));

  const attempts: Attempt[] = [];
  let onKey: ((d: number) => void) | null = null;
  let len = MIN, attempt = 0;

  await sleep(500);
  for (;;) {
    const seq = schedule.seqs[len - MIN][attempt];
    title.textContent = t("play.length", { n: len });
    status.textContent = az.play.watch;
    pad.style.visibility = "hidden";
    entered.textContent = "";
    await sleep(500);
    for (const d of seq) {
      shown.replaceChildren(h("div", { class: "digit-big" }, String(d)));
      await sleep(ON);
      shown.replaceChildren();
      await sleep(OFF);
    }
    status.textContent = az.play.yourTurn;
    pad.style.visibility = "visible";

    const res = await new Promise<Attempt & { ok: boolean }>((resolve) => {
      const digits: number[] = [];
      const start = performance.now();
      onKey = (d) => {
        digits.push(d);
        entered.textContent = digits.join(" ");
        const right = d === seq[digits.length - 1];
        if (right) fx.tap(); else fx.bad();
        if (!right || digits.length === len) {
          onKey = null;
          resolve({ digits, ms: Math.round(performance.now() - start), ok: right });
        }
      };
    });
    attempts.push({ digits: res.digits, ms: res.ms });
    pad.style.visibility = "hidden";
    await sleep(500);
    if (res.ok) {
      if (len === MAX) return { attempts };
      len++;
      attempt = 0;
    } else {
      if (attempt === 1) return { attempts };
      attempt = 1;
      status.textContent = az.play.mistake;
      await sleep(900);
    }
  }
}
