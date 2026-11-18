import { DRM_DISTRACT_MS, DRM_STUDY_MS } from "../../config/wordsets";
import { h, mount } from "../dom";
import { az, t } from "../i18n/az";

export interface DrmPublic {
  study: string[];
  probe: string[];
  distract: { a: number; b: number; options: number[] }[];
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default async function play(root: HTMLElement, s: DrmPublic): Promise<{ answers: boolean[]; times: number[] }> {
  const dots = h("div", { class: "dots" });
  const hint = h("div", { class: "soft" });
  const body = h("div", { class: "stage-body" });
  mount(root, h("div", { class: "screen full", style: "position:relative" }, dots, h("div", { class: "stage" }, hint, body)));

  // 1. study: one word at a time
  hint.textContent = az.play.studyHint;
  for (let i = 0; i < s.study.length; i++) {
    dots.textContent = t("play.progress", { n: i + 1, total: s.study.length });
    body.replaceChildren(h("div", { class: "big" }, s.study[i]));
    await sleep(DRM_STUDY_MS);
  }

  // 2. distraction: three simple sums, equal time slot each (answers are not scored)
  hint.textContent = az.play.distractHint;
  dots.textContent = "";
  const slot = DRM_DISTRACT_MS / s.distract.length;
  for (const p of s.distract) {
    const opts = h("div", { class: "opts" }, ...p.options.map((o) =>
      h("button", { class: "btn", onpointerdown: (e: Event) => (e.currentTarget as HTMLElement).classList.add("primary") }, String(o))));
    body.replaceChildren(h("div", { class: "big", style: "margin-bottom:24px" }, `${p.a} + ${p.b} = ?`), opts);
    await sleep(slot);
  }

  // 3. probe: seen / not seen
  hint.textContent = az.play.probeQ;
  const answers: boolean[] = [];
  const times: number[] = [];
  for (let i = 0; i < s.probe.length; i++) {
    dots.textContent = t("play.progress", { n: i + 1, total: s.probe.length });
    await new Promise<void>((next) => {
      let shownAt = 0;
      const reply = (seen: boolean) => {
        if (!shownAt) return;
        answers.push(seen);
        times.push(Math.round(performance.now() - shownAt));
        next();
      };
      body.replaceChildren(
        h("div", { class: "big", style: "margin-bottom:24px" }, s.probe[i]),
        h("div", { class: "opts" },
          h("button", { class: "btn opt-wide", onpointerdown: () => reply(true) }, az.play.seen),
          h("button", { class: "btn opt-wide", onpointerdown: () => reply(false) }, az.play.unseen)),
      );
      requestAnimationFrame(() => (shownAt = performance.now()));
    });
  }
  return { answers, times };
}
