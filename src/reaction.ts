// "Həyəcan": wait for the signal, then tap first. A tap before the signal puts you out of the round.
// The server decides every result; this view only shows the wait, the signal and the outcome.
import { h } from "./dom";
import { az, t } from "./i18n";
import { drainBar } from "./race";
import type { Ctx, View } from "./room";

type State = "idle" | "ready" | "go" | "locked" | "settled";

export function reactionView(ctx: Ctx): View {
  const timer = h("div", { class: "room-bar" });
  const timerTrack = h("div", { class: "room-track" }, timer);
  timerTrack.hidden = true;
  const pad = h("button", { class: "react-pad", onpointerdown: () => press() }, az.reaction.wait) as HTMLButtonElement;
  ctx.body.replaceChildren(timerTrack, pad);

  let round = 0;
  let state: State = "idle";

  /** A tap is sent during the wait (it will count as early) and during the signal window (it may win). */
  const press = () => {
    if (state !== "ready" && state !== "go") return;
    ctx.send({ t: "tap", round });
  };

  const setPad = (cls: string, text: string) => {
    pad.className = `react-pad ${cls}`;
    pad.textContent = text;
  };

  const resultText = (m: any) => {
    if (m.winner === -1) return m.reason === "early" ? az.reaction.bothEarly : az.reaction.none;
    if (m.winner === ctx.slot()) return t("reaction.wonYou", { ms: m.ms });
    return t("reaction.wonOpp", { nick: ctx.nick(m.winner), ms: m.ms });
  };

  const handle = (m: any) => {
    switch (m.t) {
      case "ready":
        round = m.n;
        state = m.locked ? "locked" : "ready";
        timerTrack.hidden = true;
        setPad(m.locked ? "early" : "", m.locked ? "✕" : az.reaction.wait);
        ctx.setStatus(t("reaction.roundOf", { n: round, total: m.total }) + " · " + (m.locked ? az.reaction.early : az.reaction.wait));
        return;
      case "go":
        round = m.n;
        state = m.locked ? "locked" : "go";
        timerTrack.hidden = false;
        timer.style.animationPlayState = "running";
        drainBar(timer, m.ms);
        setPad(m.locked ? "early" : "go", m.locked ? "✕" : az.reaction.go);
        ctx.setStatus(t("reaction.roundOf", { n: round, total: m.total }) + " · " + (m.locked ? az.reaction.early : az.reaction.goHint));
        return;
      case "early":
        state = "locked";
        setPad("early", "✕");
        ctx.setStatus(az.reaction.early);
        return;
      case "result":
        state = "settled";
        timerTrack.hidden = true;
        setPad("settled", pad.textContent ?? "");
        ctx.setStatus(resultText(m));
        return;
      case "countdown":
        state = "idle";
        timerTrack.hidden = true;
        setPad("", az.reaction.wait);
        return;
      case "end":
        state = "settled";
        timerTrack.hidden = true;
        pad.disabled = true;
        return;
    }
  };
  return { handle };
}
