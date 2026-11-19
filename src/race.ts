// "Sürətli sıra": a 5×5 table with the numbers 1–25 shuffled. Tap them in order; the server decides every result.
import { h } from "./dom";
import { az, t } from "./i18n";
import type { Ctx, Slot, View } from "./room";

const SIZE = 5; // must match worker/race-core.ts
const CELLS = SIZE * SIZE;

const lane = (label: HTMLElement, fill: HTMLElement) =>
  h("div", { class: "race-lane" }, label, h("div", { class: "room-track" }, fill));

export function raceView(ctx: Ctx): View {
  const timer = h("div", { class: "room-bar" });
  const timerTrack = h("div", { class: "room-track" }, timer);
  const mineLabel = h("span", { class: "race-label" });
  const oppLabel = h("span", { class: "race-label" });
  const mineFill = h("i", { class: "race-fill" });
  const oppFill = h("i", { class: "race-fill opp" });
  const lanes = h("div", { class: "race-lanes" }, lane(mineLabel, mineFill), lane(oppLabel, oppFill));
  const board = h("div", { class: "race-board" });
  ctx.body.replaceChildren(timerTrack, lanes, board);

  let round = 0;
  let total = 0;
  let done = 0;             // how many numbers I have tapped in order
  let frozenUntil = 0;      // after a wrong number my taps are ignored for a moment
  let decided = true;       // no taps until a table is up
  let cells = new Map<number, HTMLButtonElement>();
  let missTimer: ReturnType<typeof setTimeout> | null = null;

  const pickText = () => t("race.roundOf", { n: round, total }) + " · " + az.race.pick;

  const tap = (v: number) => {
    if (decided || v <= done || Date.now() < frozenUntil) return;
    ctx.send({ t: "tap", round, value: v });
  };

  const paint = (progress: number[]) => {
    const me = ctx.slot();
    if (me === null) return;
    const op: Slot = me === 0 ? 1 : 0;
    done = progress[me];
    mineFill.style.width = `${(done / CELLS) * 100}%`;
    oppFill.style.width = `${(progress[op] / CELLS) * 100}%`;
    mineLabel.textContent = `${az.live.you}: ${done}/${CELLS}`;
    oppLabel.textContent = `${ctx.nick(op)}: ${progress[op]}/${CELLS}`;
    cells.forEach((cell, v) => cell.classList.toggle("done", v <= done));
  };

  const restartTimer = (ms: number) => {
    timer.style.animation = "none";
    void timer.offsetWidth;
    timer.style.animationPlayState = "running";
    timer.style.animation = `room-drain ${Math.max(0, ms)}ms linear forwards`;
  };

  const resultText = (m: any) => {
    if (m.winner === -1) return az.race.tie;
    if (m.winner === ctx.slot()) return m.reason === "done" ? az.race.wonYou : az.race.wonTime;
    const nick = ctx.nick(m.winner);
    return m.reason === "done" ? t("race.oppDone", { nick }) : t("race.oppTime", { nick });
  };

  const handle = (m: any) => {
    switch (m.t) {
      case "round": {
        round = m.n;
        total = m.total;
        decided = false;
        frozenUntil = 0;
        cells = new Map();
        board.replaceChildren(...(m.grid as number[]).map((v) => {
          const cell = h("button", { class: "race-cell", onclick: () => tap(v) }, String(v)) as HTMLButtonElement;
          cells.set(v, cell);
          return cell;
        }));
        paint(m.progress);
        restartTimer(m.ms);
        ctx.setStatus(pickText());
        return;
      }
      case "progress":
        paint(m.progress);
        return;
      case "miss":
        frozenUntil = Date.now() + m.ms;
        board.classList.remove("miss");
        void board.offsetWidth;
        board.classList.add("miss");
        ctx.setStatus(az.race.miss);
        if (missTimer) clearTimeout(missTimer);
        missTimer = setTimeout(() => { if (!decided) ctx.setStatus(pickText()); }, m.ms);
        return;
      case "result":
        decided = true;
        timer.style.animationPlayState = "paused";
        paint(m.progress);
        ctx.setStatus(resultText(m));
        return;
      case "countdown":
        decided = true;
        board.replaceChildren();
        return;
      case "end":
        decided = true;
        timer.style.animationPlayState = "paused";
        return;
    }
  };
  return { handle };
}
