import { h, mount } from "../dom";
import { az } from "../i18n";

export interface LovberPublic { questionId: string; anchor: number }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default async function play(root: HTMLElement, s: LovberPublic): Promise<{ answer: number; higher: boolean }> {
  const q = az.lovber.questions[s.questionId];
  const body = h("div", { class: "stage-body" });
  mount(root, h("div", { class: "screen full" }, h("div", { class: "stage" }, body)));

  // the "wheel": random numbers flicker, then settle on the number the server assigned
  const num = h("div", { class: "hero", style: "--accent: var(--c-exp-lovber)" }, "0");
  body.replaceChildren(h("div", { class: "soft" }, az.play.wheel), num);
  const end = performance.now() + 2000;
  while (performance.now() < end) {
    num.textContent = String(Math.max(1, Math.round(s.anchor * (0.3 + Math.random() * 2.7))));
    await sleep(60);
  }
  num.textContent = String(s.anchor);
  await sleep(900);

  // question 1: more or less than the anchor
  const higher = await new Promise<boolean>((resolve) => {
    body.replaceChildren(
      num,
      h("p", { style: "margin:24px 0" }, q.q1),
      h("div", { class: "opts" },
        h("button", { class: "btn opt-wide", onclick: () => resolve(true) }, az.play.more),
        h("button", { class: "btn opt-wide", onclick: () => resolve(false) }, az.play.less)),
    );
  });

  // question 2: own estimate
  const answer = await new Promise<number>((resolve) => {
    const input = h("input", { class: "numinput", inputmode: "numeric", "aria-label": q.q2 }) as HTMLInputElement;
    const send = h("button", { class: "btn primary block", disabled: true, onclick: () => resolve(Number(input.value)) }, az.play.send) as HTMLButtonElement;
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, 6);
      send.disabled = input.value === "";
    });
    body.replaceChildren(h("p", { style: "margin-bottom:16px" }, q.q2), input, h("div", { style: "height:16px" }), send);
    input.focus();
  });
  return { answer, higher };
}
