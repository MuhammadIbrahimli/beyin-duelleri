import { h, mount } from "../dom";
import { fx } from "../fx";
import { az, t } from "../i18n";

export interface SoundSchedule { trials: { pan: -1 | 0 | 1 }[] }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A short tone comes from the left, the centre or the right. Say where it came from. Needs headphones or stereo speakers. */
export default function play(root: HTMLElement, schedule: SoundSchedule): Promise<{ choices: string[] }> {
  return new Promise((resolve) => {
    const choices: string[] = [];
    const total = schedule.trials.length;
    const dots = h("div", { class: "dots" });
    const start = h("button", { class: "btn primary block" }, az.play.soundStart);
    const bL = h("button", { class: "btn opt-wide" }, az.play.soundLeft);
    const bC = h("button", { class: "btn opt-wide" }, az.play.soundCenter);
    const bR = h("button", { class: "btn opt-wide" }, az.play.soundRight);
    const replay = h("button", { class: "link" }, az.play.soundReplay);
    const opts = h("div", { class: "opts" }, bL, bC, bR);
    const stage = h("div", { class: "stage" }, h("p", { class: "soft" }, az.play.soundAsk), start, opts, replay);
    opts.style.display = "none";
    mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, stage));

    let ctx: AudioContext | null = null;
    let i = 0, answering = false;
    const tone = () => {
      if (!ctx) return;
      const tr = schedule.trials[i];
      const o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner();
      o.frequency.value = 660;
      p.pan.value = tr.pan;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      o.connect(g).connect(p).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.55);
    };
    const answer = (c: "left" | "center" | "right") => {
      if (!answering) return;
      answering = false;
      choices.push(c);
      fx.tap();
      i++;
      setTimeout(step, 400);
    };
    bL.addEventListener("pointerdown", () => answer("left"));
    bC.addEventListener("pointerdown", () => answer("center"));
    bR.addEventListener("pointerdown", () => answer("right"));
    replay.addEventListener("click", () => { if (answering) tone(); });

    async function step() {
      if (i === total) return resolve({ choices });
      dots.textContent = t("play.progress", { n: i + 1, total });
      answering = false;
      await sleep(300);
      tone();
      await sleep(550);
      answering = true;
    }

    start.addEventListener("click", () => {
      ctx ??= new AudioContext();
      if (ctx.state === "suspended") void ctx.resume();
      start.style.display = "none";
      opts.style.display = "";
      setTimeout(step, 200);
    });
  });
}
