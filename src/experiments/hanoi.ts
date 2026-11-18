import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface HanoiSchedule { sizes: number[] }
const MAX_MOVES = 80;

/** Tower of Hanoi: tap a peg to pick its top disk, then tap another peg to put it there. Two puzzles, fewer moves is better. */
export default function play(root: HTMLElement, schedule: HanoiSchedule): Promise<{ puzzles: [number, number][][] }> {
  return new Promise((resolve) => {
    const puzzles: [number, number][][] = [];
    const dots = h("div", { class: "dots" });
    const info = h("div", { class: "soft", "aria-live": "polite" });
    const board = h("div", { class: "hanoi-board" });
    const reset = h("button", { class: "btn" }, az.play.hanoiReset);
    const stage = h("div", { class: "stage" }, info, board, h("div", { class: "opts" }, reset));
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let p = 0, pegs: number[][] = [], moves: [number, number][] = [], selected = -1;
    const start = (n: number) => Array.from({ length: n }, (_, i) => n - i); // largest first, top = last

    function draw() {
      const n = schedule.sizes[p];
      dots.textContent = t("play.progress", { n: p + 1, total: schedule.sizes.length });
      info.textContent = t("play.moves", { n: moves.length });
      const pegEls = [0, 1, 2].map((peg) => {
        const disks = pegs[peg].map((d) => h("div", { class: "hanoi-disk", style: `width:${30 + d * (60 / n)}%` }));
        const el = h("div", { class: "hanoi-peg" + (selected === peg ? " on" : ""), "data-peg": String(peg), role: "button", "aria-label": String(peg + 1) },
          ...disks.reverse().map((d) => d), h("div", { class: "hanoi-rod" }));
        el.addEventListener("pointerdown", () => tap(peg));
        return el;
      });
      board.replaceChildren(...pegEls);
    }

    function nextPuzzle() {
      puzzles.push(moves);
      p++;
      if (p === schedule.sizes.length) return resolve({ puzzles });
      begin();
    }

    function begin() {
      pegs = [start(schedule.sizes[p]), [], []];
      moves = [];
      selected = -1;
      draw();
    }

    function tap(peg: number) {
      if (selected === -1) {
        if (pegs[peg].length) { selected = peg; draw(); }
        return;
      }
      const from = selected;
      selected = -1;
      if (from === peg) return draw();
      const disk = pegs[from][pegs[from].length - 1];
      const top = pegs[peg][pegs[peg].length - 1];
      if (top !== undefined && top < disk) { fx.bad(); return draw(); }
      pegs[from].pop();
      pegs[peg].push(disk);
      moves.push([from, peg]);
      fx.tap();
      draw();
      const n = schedule.sizes[p];
      if (pegs[2].length === n) { setTimeout(nextPuzzle, 600); return; }
      if (moves.length >= MAX_MOVES) setTimeout(nextPuzzle, 300);
    }

    reset.addEventListener("pointerdown", () => begin());
    setTimeout(begin, 300);
  });
}
