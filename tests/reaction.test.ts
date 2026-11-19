import { describe, expect, it } from "vitest";
import * as re from "../worker/reaction-core";

const kinds = (out: { timers: { kind: string }[] }) => out.timers.map((t) => t.kind);
const msgs = (out: { events: { to?: unknown; msg: Record<string, unknown> }[] }, t: string) => out.events.filter((e) => e.msg.t === t);

/** Two players seated; the first wait is running. */
function start(seed = 808) {
  const room = re.createReaction(seed);
  re.join(room, "u1", "Əli");
  re.join(room, "u2", "Leyla");
  re.countdownDone(room);
  return room;
}

/** The signal goes out at time `at`. */
function signal(room: re.Reaction, at = 10000) {
  return re.goDone(room, room.round, at);
}

describe("waits", () => {
  it("every round waits between 1.5 and 4 seconds, five rounds", () => {
    for (let seed = 1; seed < 30; seed++) {
      const w = re.makeWaits(seed);
      expect(w).toHaveLength(re.ROUNDS);
      for (const ms of w) expect(ms >= re.MIN_WAIT_MS && ms <= re.MAX_WAIT_MS).toBe(true);
    }
  });

  it("the same seed gives the same waits", () => {
    expect(re.makeWaits(5)).toEqual(re.makeWaits(5));
  });

  it("the wait is announced to both players without the signal time", () => {
    const room = re.createReaction(2);
    re.join(room, "u1", "Əli");
    re.join(room, "u2", "Leyla");
    const out = re.countdownDone(room);
    const ready = msgs(out, "ready")[0];
    expect(ready.to).toBe("all");
    expect(ready.msg).toMatchObject({ t: "ready", n: 1, total: re.ROUNDS, ms: room.waits[0], locked: false });
    expect(kinds(out)).toEqual(["go"]);
  });
});

describe("the signal", () => {
  it("when the wait ends the signal goes to both and the reaction window opens", () => {
    const room = start();
    const out = signal(room, 5000);
    expect(room.phase).toBe("go");
    expect(room.goAt).toBe(5000);
    expect(msgs(out, "go")[0].msg).toMatchObject({ t: "go", ms: re.GO_MS });
    expect(kinds(out)).toEqual(["round"]);
  });

  it("an old signal timer does nothing", () => {
    const room = start();
    signal(room);
    expect(signal(room).events).toEqual([]);
  });
});

describe("tapping", () => {
  it("a tap after the signal wins the round, with the reaction time", () => {
    const room = start();
    signal(room, 10000);
    const out = re.tap(room, 0, 1, 10237);
    expect(room.score).toEqual([1, 0]);
    expect(msgs(out, "result")[0].msg).toMatchObject({ winner: 0, reason: "fast", ms: 237, score: [1, 0] });
    expect(kinds(out)).toEqual(["next"]);
  });

  it("a tap before the signal is early: only that player hears it and is out of the round", () => {
    const room = start();
    const out = re.tap(room, 1, 1, 100);
    expect(msgs(out, "early")[0]).toMatchObject({ to: 1 });
    expect(room.locked).toEqual([false, true]);
    expect(room.phase).toBe("ready");
    // the other player can still win once the signal goes out
    signal(room, 5000);
    re.tap(room, 0, 1, 5300);
    expect(room.score).toEqual([1, 0]);
  });

  it("a player who was early cannot win the round after the signal", () => {
    const room = start();
    re.tap(room, 0, 1, 100);
    signal(room);
    expect(re.tap(room, 0, 1, 10100).events).toEqual([]);
    expect(room.phase).toBe("go");
  });

  it("when both were early nobody gets the round", () => {
    const room = start();
    re.tap(room, 0, 1, 100);
    const out = re.tap(room, 1, 1, 200);
    expect(msgs(out, "result")[0].msg).toMatchObject({ winner: -1, reason: "early" });
    expect(room.score).toEqual([0, 0]);
    expect(room.phase).toBe("between");
  });

  it("a second tap in the same round changes nothing", () => {
    const room = start();
    signal(room, 10000);
    re.tap(room, 0, 1, 10200);
    expect(re.tap(room, 1, 1, 10300).events.some((e) => e.msg.t === "result")).toBe(false);
    expect(room.score).toEqual([1, 0]);
  });

  it("a tap for an old round is ignored", () => {
    const room = start();
    signal(room);
    expect(re.tap(room, 0, 2, 10100).events).toEqual([]);
  });
});

describe("no tap in time", () => {
  it("when the window closes nobody wins the round", () => {
    const room = start();
    signal(room);
    const out = re.goTimeout(room, 1);
    expect(msgs(out, "result")[0].msg).toMatchObject({ winner: -1, reason: "time" });
    expect(room.score).toEqual([0, 0]);
  });

  it("an old window timer does nothing once the round is decided", () => {
    const room = start();
    signal(room);
    re.tap(room, 0, 1, 10100);
    expect(re.goTimeout(room, 1).events).toEqual([]);
  });
});

describe("the whole match", () => {
  it("five rounds; the player with more rounds wins", () => {
    const room = start();
    for (let r = 1; r <= re.ROUNDS; r++) {
      signal(room);
      re.tap(room, 0, r, 10100);
      const next = re.nextTimeout(room, r);
      if (r < re.ROUNDS) expect(room.phase).toBe("ready");
      else expect(msgs(next, "end")[0].msg).toMatchObject({ winner: 0, score: [re.ROUNDS, 0] });
    }
  });

  it("an equal score at the end is a draw", () => {
    const room = start();
    room.score = [2, 2];
    room.round = re.ROUNDS;
    room.phase = "between";
    expect(msgs(re.nextTimeout(room, re.ROUNDS), "end")[0].msg).toMatchObject({ winner: -1 });
  });
});

describe("disconnects and coming back", () => {
  it("a player who comes back during the wait gets the wait with the time left and their lock", () => {
    const room = start();
    re.tap(room, 1, 1, 50);
    expect(re.resume(room, 1, 900)).toEqual([{ to: 1, msg: expect.objectContaining({ t: "ready", ms: 900, locked: true }) }]);
    expect(re.resume(room, 0, 900)).toEqual([{ to: 0, msg: expect.objectContaining({ t: "ready", locked: false }) }]);
  });

  it("a player who comes back during the signal window gets the window with the time left", () => {
    const room = start();
    signal(room);
    expect(re.resume(room, 0, 2000)).toEqual([{ to: 0, msg: expect.objectContaining({ t: "go", ms: 2000 }) }]);
  });

  it("a player who drops is given a window; not coming back forfeits", () => {
    const room = start();
    expect(kinds(re.leave(room, 1))).toEqual(["away"]);
    expect(msgs(re.awayTimeout(room, 1), "end")[0].msg).toMatchObject({ winner: 0, reason: "forfeit" });
  });

  it("the engine adapter starts the signal window when the go timer runs out", () => {
    const room = start();
    const out = re.reactionEngine.timer(room, { kind: "go", ms: 0, round: 1 }, 7777);
    expect(room.phase).toBe("go");
    expect(room.goAt).toBe(7777);
    expect(msgs(out, "go")).toHaveLength(1);
    expect(re.reactionEngine.inRound(room)).toBe(true);
  });
});
