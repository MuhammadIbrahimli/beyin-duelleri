import { h, mount } from "../dom";
import { fx } from "../fx";
import { audioCtx, track } from "../audio";
let ctx: AudioContext | null = null;
import { az, t } from "../i18n";

export interface PitchSchedule { trials: { base: number; ratio: number; higher: "first" | "second" }[] }

/** Two tones one after another. Say whether the first or the second is higher. Needs sound: tap start first. */
export default function play(root: HTMLElement, schedule: PitchSchedule): Promise<{ choices: string[] }> {
  return new Promise((resolve) => {
    const choices: string[] = [];
    const total = schedule.trials.length;
    const dots = h("div", { class: "dots" });
    const ask = h("div", { class: "soft" }, az.play.pitchAsk);
    const start = h("button", { class: "btn primary block" }, az.play.pitchStart);
    const first = h("button", { class: "btn opt-wide" }, az.play.pitchFirst);
    const second = h("button", { class: "btn opt-wide" }, az.play.pitchSecond);
    const replay = h("button", { class: "link" }, az.play.pitchReplay);
    const opts = h("div", { class: "opts" }, first, second);
    const stage = h("div", { class: "stage" }, ask, start, opts, replay);
    opts.style.display = "none";
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let i = 0, answering = false;
    const tone = (freq: number, at: number) => {
      if (!ctx) return;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, ctx.currentTime + at);
      g.gain.linearRampToValueAtTime(0.18, ctx.currentTime + at + 0.02);
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + at + 0.4);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + at);
      track(o);
      o.stop(ctx.currentTime + at + 0.45);
    };
    const play2 = () => {
      const tr = schedule.trials[i];
      const low = tr.base, high = tr.base * tr.ratio;
      const firstFreq = tr.higher === "first" ? high : low;
      const secondFreq = tr.higher === "first" ? low : high;
      tone(firstFreq, 0);
      tone(secondFreq, 0.6);
    };

    const answer = (c: "first" | "second") => {
      if (!answering) return;
      answering = false;
      choices.push(c);
      const ok = c === schedule.trials[i].higher;
      if (ok) fx.good(); else fx.bad();
      i++;
      setTimeout(step, 400);
    };
    first.addEventListener("pointerdown", () => answer("first"));
    second.addEventListener("pointerdown", () => answer("second"));
    replay.addEventListener("click", () => { if (answering) play2(); });

    function step() {
      if (i === total) return resolve({ choices });
      dots.textContent = t("play.progress", { n: i + 1, total });
      answering = true;
      play2();
    }

    start.addEventListener("click", () => {
      ctx = audioCtx();
      start.style.display = "none";
      opts.style.display = "";
      setTimeout(step, 200);
    });
  });
}
