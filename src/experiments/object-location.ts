import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface LocSchedule { trials: { shown: number[]; shapes: number[]; probe: number }[] }
const SYMBOLS6 = ["■", "▲", "✚", "◆", "★", "●"];
const COLS = 4, STUDY_MS = 2500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Shapes appear on a grid for a moment. Then, from memory, tap the cell where the asked shape was. */
export default function play(root: HTMLElement, schedule: LocSchedule): Promise<{ cells: number[] }> {
  return new Promise((resolve) => {
    const cells: number[] = [];
    const total = schedule.trials.length;
    const dots = h("div", { class: "dots" });
    const grid = h("div", { class: "loc-grid" });
    const ask = h("div", { class: "soft" });
    const stage = h("div", { class: "stage" }, ask, grid);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    const drawGrid = (content: Map<number, string> | null, onPick?: (c: number) => void) => {
      grid.replaceChildren(...Array.from({ length: 12 }, (_, c) => {
        const b = h("button", { class: "loc-cell", "aria-label": String(c + 1) }, content?.get(c) ?? "");
        if (onPick) b.addEventListener("pointerdown", () => onPick(c));
        return b;
      }));
    };

    async function trial(i: number) {
      if (i === total) return resolve({ cells });
      const tr = schedule.trials[i];
      dots.textContent = t("play.progress", { n: i + 1, total });
      const content = new Map<number, string>();
      tr.shown.forEach((c, k) => content.set(c, SYMBOLS6[tr.shapes[k]]));
      drawGrid(content);
      await sleep(STUDY_MS);
      drawGrid(null);
      ask.textContent = t("play.locAsk", { s: SYMBOLS6[tr.shapes[tr.probe]] });
      await new Promise<void>((next) => {
        drawGrid(null, (c) => { cells.push(c); fx.tap(); next(); });
      });
      ask.textContent = "";
      await sleep(300);
      return trial(i + 1);
    }
    void COLS;
    setTimeout(() => trial(0), 400);
  });
}
