import { el, h, mount } from "../dom";
import { az, t } from "../i18n";

interface Round { kind: "brightness" | "muller" | "ebbinghaus"; flip: boolean; v: number }
export interface IllusionSchedule { rounds: Round[] }

const W = 340, H = 200;
type Drawn = { svg: SVGElement; context: SVGElement[]; guides: SVGElement[] };
const fill = (c: string) => `fill:${c}`;

/** All three drawings are our own SVG. In every one the two target shapes are exactly equal. */
function brightness(r: Round): Drawn {
  const g = Math.round(112 + r.v * 0.3);
  const gray = `rgb(${g},${g},${g})`;
  const bgL = el("rect", { x: 0, y: 0, width: W / 2, height: H, style: fill(r.flip ? "#1c1c1c" : "#f0f0f0") });
  const bgR = el("rect", { x: W / 2, y: 0, width: W / 2, height: H, style: fill(r.flip ? "#f0f0f0" : "#1c1c1c") });
  const base = el("rect", { x: 0, y: 0, width: W, height: H, style: fill("#1b1f3b") });
  const sq = (cx: number) => el("rect", { x: cx - 32, y: H / 2 - 32, width: 64, height: 64, style: fill(gray) });
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}` }, base, bgL, bgR, sq(W / 4), sq((3 * W) / 4));
  return { svg, context: [bgL, bgR], guides: [] };
}

function muller(r: Round): Drawn {
  const len = 150 + Math.round(r.v * 0.2);
  const x1 = (W - len) / 2, x2 = x1 + len, f = 16;
  const stroke = { stroke: "#f4f5ff", "stroke-width": 4, "stroke-linecap": "round" };
  const line = (y: number) => el("line", { x1, y1: y, x2, y2: y, ...stroke });
  // out = fins point away from the line (looks longer); otherwise they point inward (looks shorter)
  const fins = (y: number, out: boolean) => {
    const s = out ? 1 : -1;
    const mk = (x: number, dir: number, dy: number) => el("line", { x1: x, y1: y, x2: x + dir * s * f, y2: y + dy, ...stroke });
    return [mk(x1, -1, -f), mk(x1, -1, f), mk(x2, 1, -f), mk(x2, 1, f)];
  };
  const yA = 70, yB = 130;
  const finsTop = fins(yA, !r.flip);
  const finsBottom = fins(yB, r.flip);
  const guide = (x: number) =>
    el("line", { x1: x, y1: 30, x2: x, y2: 170, stroke: "#ffd23f", "stroke-width": 2, "stroke-dasharray": "6 6", opacity: 0 });
  const guides = [guide(x1), guide(x2)];
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}` }, line(yA), line(yB), ...finsTop, ...finsBottom, ...guides);
  return { svg, context: [...finsTop, ...finsBottom], guides };
}

function ebbinghaus(r: Round): Drawn {
  const rad = 22 + Math.round(r.v * 0.08);
  const ring = (cx: number, n: number, size: number, dist: number) =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return el("circle", { cx: cx + Math.cos(a) * dist, cy: H / 2 + Math.sin(a) * dist, r: size, style: fill("#8a90c0") });
    });
  const smallRing = (cx: number) => ring(cx, 6, 9, rad + 9 + 6);
  const bigRing = (cx: number) => ring(cx, 6, 26, rad + 26 + 6);
  const cxL = 85, cxR = 255;
  const ctx = [...(r.flip ? bigRing(cxL) : smallRing(cxL)), ...(r.flip ? smallRing(cxR) : bigRing(cxR))];
  const centre = (cx: number) => el("circle", { cx, cy: H / 2, r: rad, style: fill("var(--c-exp-eyni-rengdir)") });
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}` }, ...ctx, centre(cxL), centre(cxR));
  return { svg, context: ctx, guides: [] };
}

const DRAW = { brightness, muller, ebbinghaus };

export default async function play(root: HTMLElement, schedule: IllusionSchedule): Promise<{ answers: boolean[]; times: number[] }> {
  const answers: boolean[] = [];
  const times: number[] = [];
  const total = schedule.rounds.length;
  for (const round of schedule.rounds) {
    await new Promise<void>((done) => {
      const drawn = DRAW[round.kind](round);
      drawn.svg.setAttribute("class", "illusion");
      const dots = h("div", { class: "dots" }, t("play.progress", { n: answers.length + 1, total }));
      const actions = h("div", { class: "opts" });
      const after = h("div", { class: "after" });
      mount(root, h("div", { class: "screen full", style: "position:relative" }, dots,
        h("div", { class: "stage" }, h("h2", null, az.play.same), drawn.svg, actions, after)));

      let shownAt = 0;
      requestAnimationFrame(() => (shownAt = performance.now()));
      let answered = false;
      const answer = (same: boolean) => {
        if (answered || !shownAt) return;
        answered = true;
        answers.push(same);
        times.push(Math.round(performance.now() - shownAt));
        actions.remove();
        const slider = h("input", { type: "range", min: 0, max: 100, value: 0, class: "slider", "aria-label": az.play.check }) as HTMLInputElement;
        slider.addEventListener("input", () => {
          const v = Number(slider.value) / 100;
          drawn.context.forEach((n) => n.setAttribute("opacity", String(1 - v)));
          drawn.guides.forEach((n) => n.setAttribute("opacity", String(v)));
        });
        const last = answers.length === total;
        after.append(
          h("p", { class: "soft" }, az.play.alwaysOk),
          h("label", null, az.play.check),
          slider,
          h("button", { class: "btn primary block", onclick: () => done() }, last ? az.play.finish : az.play.next),
        );
      };
      actions.append(
        h("button", { class: "btn opt-wide", onpointerdown: () => answer(true) }, az.play.yes),
        h("button", { class: "btn opt-wide", onpointerdown: () => answer(false) }, az.play.no),
      );
    });
  }
  return { answers, times };
}
