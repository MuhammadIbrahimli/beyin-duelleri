import { el, h, mount } from "../dom";
import { az, t } from "../i18n";

export interface TraceSchedule { paths: [number, number][][] }

/** A path appears. Drag your finger or mouse along it without leaving it. Next path after each one. */
export default function play(root: HTMLElement, schedule: TraceSchedule): Promise<{ traces: [number, number][][] }> {
  return new Promise((resolve) => {
    const traces: [number, number][][] = [];
    const total = schedule.paths.length;
    const dots = h("div", { class: "dots" });
    const field = h("div", { class: "tr-field" });
    const stage = h("div", { class: "stage" }, h("p", { class: "soft" }, az.play.traceAsk), field);
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0, drawing = false, current: [number, number][] = [];
    const toPct = (e: PointerEvent): [number, number] => {
      const r = field.getBoundingClientRect();
      return [Math.round(((e.clientX - r.left) / r.width) * 1000) / 10, Math.round(((e.clientY - r.top) / r.height) * 1000) / 10];
    };
    field.style.touchAction = "none";
    field.addEventListener("pointerdown", (e) => { drawing = true; current = [toPct(e)]; });
    field.addEventListener("pointermove", (e) => { if (drawing) current.push(toPct(e)); });
    const release = () => {
      if (!drawing) return;
      drawing = false;
      traces.push(current);
      i++;
      if (i === total) return resolve({ traces });
      setTimeout(draw, 300);
    };
    field.addEventListener("pointerup", release);
    field.addEventListener("pointerleave", release);

    function draw() {
      dots.textContent = t("play.progress", { n: i + 1, total });
      const path = schedule.paths[i];
      const svg = el("svg", { viewBox: "0 0 100 100", preserveAspectRatio: "none", class: "tr-svg" });
      svg.append(el("polyline", { points: path.map((p) => p.join(",")).join(" "), fill: "none", stroke: "#2a2f55", "stroke-width": 8, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      svg.append(el("polyline", { points: path.map((p) => p.join(",")).join(" "), fill: "none", stroke: "#ffd23f", "stroke-width": 1.2, "stroke-linejoin": "round" }));
      field.replaceChildren(svg);
    }
    setTimeout(draw, 300);
  });
}
