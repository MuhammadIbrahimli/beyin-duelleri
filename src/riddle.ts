// "Tapmaca yarışı": one riddle for both players, four answers, the first right answer wins the round.
// A wrong answer freezes that player's taps for a moment. The server decides every result.
import { h } from "./dom";
import { az, t } from "./i18n";
import { drainBar } from "./race";
import type { Ctx, View } from "./room";

export function riddleView(ctx: Ctx): View {
  const timer = h("div", { class: "room-bar" });
  const timerTrack = h("div", { class: "room-track" }, timer);
  const text = h("p", { class: "riddle-text" });
  const opts = h("div", { class: "opts riddle-opts" });
  ctx.body.replaceChildren(timerTrack, text, opts);

  let round = 0;
  let total = 0;
  let decided = true;
  let frozenUntil = 0;
  let buttons: HTMLButtonElement[] = [];
  let options: string[] = [];
  let thawTimer: ReturnType<typeof setTimeout> | null = null;

  const pick = (i: number) => {
    if (decided || Date.now() < frozenUntil) return;
    ctx.send({ t: "tap", round, choice: i });
  };

  const settle = () => {
    decided = true;
    buttons.forEach((b) => { b.disabled = true; });
    timer.style.animationPlayState = "paused";
  };

  const resultText = (m: any) => {
    if (m.winner === -1) return t("riddle.time", { answer: m.answer });
    if (m.winner === ctx.slot()) return az.riddle.wonYou;
    return t("riddle.wonOpp", { nick: ctx.nick(m.winner) });
  };

  const handle = (m: any) => {
    switch (m.t) {
      case "round": {
        round = m.n;
        total = m.total;
        decided = false;
        frozenUntil = 0;
        options = m.options as string[];
        buttons = options.map((o, i) => h("button", { class: "btn opt-wide", onclick: () => pick(i) }, o) as HTMLButtonElement);
        opts.replaceChildren(...buttons);
        text.textContent = m.text;
        timerTrack.hidden = false;
        timer.style.animationPlayState = "running";
        drainBar(timer, m.ms);
        ctx.setStatus(t("riddle.roundOf", { n: round, total: m.total }) + " · " + az.riddle.hint);
        return;
      }
      case "miss":
        frozenUntil = Date.now() + m.ms;
        ctx.setStatus(az.riddle.miss);
        buttons.forEach((b) => b.classList.add("dim"));
        if (thawTimer) clearTimeout(thawTimer);
        thawTimer = setTimeout(() => {
          buttons.forEach((b) => b.classList.remove("dim"));
          if (!decided) ctx.setStatus(t("riddle.roundOf", { n: round, total }) + " · " + az.riddle.hint);
        }, m.ms);
        return;
      case "result": {
        settle();
        const right = options.indexOf(m.answer);
        buttons[right]?.classList.add("good");
        ctx.setStatus(resultText(m));
        return;
      }
      case "countdown":
        settle();
        text.textContent = "";
        opts.replaceChildren();
        timerTrack.hidden = true;
        return;
      case "end":
        settle();
        timerTrack.hidden = true;
        return;
    }
  };
  return { handle };
}
