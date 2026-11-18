import { el, h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

type Sq = { x: number; y: number; colour: string };
export interface ChangeSchedule { trials: { size: number; set: Sq[]; probe: Sq[]; cond: "base" | "cost" }[] }
const W = 320, H = 240, CELL = 80, SIZE = 56;
const COLOUR_HEX: Record<string, string> = { red: "#ff5a5f", blue: "#4aa3ff", green: "#4cd483", yellow: "#ffd23f" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function board(squares: Sq[]) {
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "cd-svg" });
  for (const s of squares) {
    svg.append(el("rect", { x: s.x * CELL + (CELL - SIZE) / 2 + 8, y: s.y * CELL + (CELL - SIZE) / 2 + 8, width: SIZE, height: SIZE, rx: 8, fill: COLOUR_HEX[s.colour] }));
  }
  return svg;
}

/** Coloured squares for a moment, then a blank, then one probe: is it the same as before? Resolves with yes (same) / no (changed). */
export default function play(root: HTMLElement, schedule: ChangeSchedule): Promise<{ choices: (string | null)[]; times: number[] }> {
  return new Promise((resolve) => {
    const choices: (string | null)[] = [], times: number[] = [];
    const total = schedule.trials.length;
    const dots = h("div", { class: "dots" });
    const canvas = h("div", { class: "cd-canvas", "aria-live": "polite" });
    const same = h("button", { class: "btn opt-wide" }, az.play.keepSame);
    const changed = h("button", { class: "btn opt-wide" }, az.play.keepChanged);
    const stage = h("div", { class: "stage" }, canvas, h("div", { class: "opts" }, same, changed));
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0, shownAt = 0, answered = true;
    const answer = (c: "yes" | "no") => {
      if (answered) return;
      answered = true;
      choices.push(c);
      times.push(Math.round(performance.now() - shownAt));
      fx.tap(); // no right/wrong sound: the answer is not revealed
      i++;
      setTimeout(step, 250);
    };
    same.addEventListener("pointerdown", () => answer("yes"));
    changed.addEventListener("pointerdown", () => answer("no"));

    async function step() {
      if (i === total) return resolve({ choices, times });
      const tr = schedule.trials[i];
      dots.textContent = t("play.progress", { n: i + 1, total });
      answered = true; // not answerable during the memory phase
      canvas.replaceChildren(board(tr.set));
      await sleep(900);
      canvas.replaceChildren(el("svg", { viewBox: `0 0 ${W} ${H}`, class: "cd-svg" }));
      await sleep(800);
      canvas.replaceChildren(board(tr.probe));
      answered = false;
      requestAnimationFrame(() => { shownAt = performance.now(); });
    }
    setTimeout(step, 400);
  });
}
