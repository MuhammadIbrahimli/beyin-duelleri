// "Yaddaş döyüşü": tiles light up one after another, then both players repeat the sequence.
// The server decides every result; this view only shows the watching and the repeat.
import { h } from "./dom";
import { az, t } from "./i18n";
import { drainBar, progressLanes } from "./race";
import type { Ctx, View } from "./room";

const SIDE = 3; // must match worker/memory-core.ts (TILES = 9)

export function memoryView(ctx: Ctx): View {
  const timer = h("div", { class: "room-bar" });
  const timerTrack = h("div", { class: "room-track" }, timer);
  const lanes = progressLanes(ctx);
  const tiles = Array.from({ length: SIDE * SIDE }, (_, i) =>
    h("button", { class: "memory-tile", "aria-label": String(i + 1), onclick: () => tap(i) }) as HTMLButtonElement);
  const board = h("div", { class: "memory-board" }, ...tiles);
  ctx.body.replaceChildren(timerTrack, lanes.node, board);

  let round = 0;
  let len = 0;
  let open = false;        // the repeat is on: taps are sent
  let locked = false;      // I was wrong this round
  let watchTimers: ReturnType<typeof setTimeout>[] = [];

  const enable = (on: boolean) => tiles.forEach((b) => { b.disabled = !on; });
  const light = (tile: number, on: boolean) => tiles[tile]?.classList.toggle("lit", on);

  const tap = (tile: number) => {
    if (!open || locked) return;
    ctx.send({ t: "tap", round, tile });
  };

  const clearWatch = () => {
    watchTimers.forEach(clearTimeout);
    watchTimers = [];
    tiles.forEach((_, i) => light(i, false));
  };

  /** Lights the tiles one by one, the same way the server counts the watching. */
  const watch = (seq: number[], step: number) => {
    clearWatch();
    seq.forEach((tile, i) => {
      watchTimers.push(setTimeout(() => light(tile, true), i * step));
      watchTimers.push(setTimeout(() => light(tile, false), i * step + step * 0.7));
    });
  };

  const resultText = (m: any) => {
    if (m.winner === -1) return m.reason === "miss" ? az.memory.miss : az.memory.tie;
    if (m.winner === ctx.slot()) return m.reason === "done" ? az.memory.wonYou : az.memory.wonTime;
    const nick = ctx.nick(m.winner);
    return m.reason === "done" ? t("memory.oppDone", { nick }) : t("memory.oppTime", { nick });
  };

  const handle = (m: any) => {
    switch (m.t) {
      case "show": {
        round = m.n;
        len = m.seq.length;
        open = false;
        locked = false;
        enable(false);
        timerTrack.hidden = true;
        lanes.paint([0, 0], len);
        ctx.setStatus(t("memory.roundOf", { n: round, total: m.total }) + " · " + az.memory.watch);
        watch(m.seq, m.step);
        // a reconnect during the watching: the watch restarts, the repeat comes with the server's timer
        return;
      }
      case "input":
        round = m.n;
        len = m.len;
        open = true;
        locked = !!m.locked;
        clearWatch();
        enable(!locked);
        timerTrack.hidden = false;
        timer.style.animationPlayState = "running";
        drainBar(timer, m.ms);
        lanes.paint(m.progress, len);
        ctx.setStatus(locked ? az.live.locked : t("memory.roundOf", { n: round, total: m.total }) + " · " + az.memory.repeat);
        return;
      case "progress":
        lanes.paint(m.progress, len);
        return;
      case "lock":
        locked = true;
        enable(false);
        ctx.setStatus(az.live.locked);
        return;
      case "result":
        open = false;
        enable(false);
        timer.style.animationPlayState = "paused";
        lanes.paint(m.progress, len);
        ctx.setStatus(resultText(m));
        return;
      case "countdown":
        open = false;
        clearWatch();
        enable(false);
        return;
      case "end":
        open = false;
        clearWatch();
        enable(false);
        timerTrack.hidden = true;
        return;
    }
  };
  return { handle };
}
