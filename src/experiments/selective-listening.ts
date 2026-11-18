import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface ListenSchedule { trials: { left: number; right: number }[] }
const GAP_MS = 500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Beeps come in both ears. High beeps are in the left ear, low ones in the right. Count the high beeps only. */
export default function play(root: HTMLElement, schedule: ListenSchedule): Promise<{ answers: number[] }> {
  return new Promise((resolve) => {
    const answers: number[] = [];
    const total = schedule.trials.length;
    const dots = h("div", { class: "dots" });
    const ask = h("div", { class: "soft" }, az.play.listenAsk);
    const pad = h("div", { class: "lt-pad" });
    const start = h("button", { class: "btn primary block" }, az.play.listenStart);
    const stage = h("div", { class: "stage" }, start, ask, pad);
    pad.style.display = "none";
    ask.style.display = "none";
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let ctx: AudioContext | null = null;
    const beep = (freq: number, pan: number, at: number) => {
      if (!ctx) return;
      const o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner();
      o.frequency.value = freq;
      p.pan.value = pan;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.12);
      o.connect(g).connect(p).connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + 0.14);
    };

    async function trial(i: number) {
      if (i === total) return resolve({ answers });
      const tr = schedule.trials[i];
      dots.textContent = t("play.progress", { n: i + 1, total });
      pad.style.display = "none";
      ask.style.display = "none";
      // interleave: a high beep in the left ear, a low beep in the right ear, both at random-looking times
      const events: { at: number; high: boolean }[] = [];
      for (let k = 0; k < tr.left; k++) events.push({ at: k * GAP_MS * 2 + 200, high: true });
      for (let k = 0; k < tr.right; k++) events.push({ at: k * GAP_MS * 2 + 200 + GAP_MS / 2, high: false });
      for (const e of events) beep(e.high ? 880 : 330, e.high ? -1 : 1, e.at / 1000);
      await sleep(Math.max(...events.map((e) => e.at)) + 800);
      ask.style.display = "";
      pad.style.display = "";
      pad.replaceChildren(...Array.from({ length: 10 }, (_, d) => {
        const b = h("button", { class: "btn lt-key" }, String(d));
        b.addEventListener("pointerdown", () => { answers.push(d); fx.tap(); setTimeout(() => trial(i + 1), 400); });
        return b;
      }));
    }

    start.addEventListener("click", () => {
      ctx ??= new AudioContext();
      if (ctx.state === "suspended") void ctx.resume();
      start.style.display = "none";
      setTimeout(() => trial(0), 300);
    });
  });
}
