import { describe, expect, it } from "vitest";
import * as race from "../worker/race-core";

const kinds = (out: { timers: { kind: string }[] }) => out.timers.map((t) => t.kind);
const msgs = (out: { events: { to?: unknown; msg: Record<string, unknown> }[] }, t: string) => out.events.filter((e) => e.msg.t === t);

/** Two players seated, the first table is up. */
function start(seed = 4242) {
  const room = race.createRace(seed);
  race.join(room, "u1", "Əli");
  race.join(room, "u2", "Leyla");
  race.countdownDone(room);
  return room;
}

/** Taps 1..n in order for one player at time `now`. */
function tapUpTo(room: race.Race, slot: 0 | 1, n: number, now = 0) {
  let last: ReturnType<typeof race.tap> | null = null;
  for (let v = room.progress[slot] + 1; v <= n; v++) last = race.tap(room, slot, room.round, v, now);
  return last;
}

describe("tables", () => {
  it("each round has every number from 1 to 25 exactly once", () => {
    const grids = race.makeGrids(99);
    expect(grids).toHaveLength(race.ROUNDS);
    for (const g of grids) expect([...g].sort((a, b) => a - b)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });

  it("the same seed gives the same tables; the rounds differ from each other", () => {
    expect(race.makeGrids(7)).toEqual(race.makeGrids(7));
    expect(race.makeGrids(7)[0]).not.toEqual(race.makeGrids(7)[1]);
  });
});

describe("starting a table", () => {
  it("the table is sent to both players with the time limit and zero progress", () => {
    const room = race.createRace(1);
    race.join(room, "u1", "Əli");
    const second = race.join(room, "u2", "Leyla");
    expect(kinds(second)).toEqual(["countdown"]);
    const out = race.countdownDone(room);
    const table = msgs(out, "round")[0];
    expect(table.to).toBe("all");
    expect(table.msg).toMatchObject({ t: "round", n: 1, total: race.ROUNDS, size: 5, ms: race.ROUND_MS, progress: [0, 0] });
    expect((table.msg.grid as number[]).length).toBe(25);
    expect(kinds(out)).toEqual(["round"]);
  });
});

describe("tapping in order", () => {
  it("each correct number moves that player forward and tells both sides", () => {
    const room = start();
    const out = race.tap(room, 0, 1, 1, 0);
    expect(room.progress).toEqual([1, 0]);
    expect(msgs(out, "progress")[0]).toMatchObject({ to: "all", msg: { progress: [1, 0] } });
  });

  it("a number out of order is a miss: only that player hears it, and taps freeze for a moment", () => {
    const room = start();
    const miss = race.tap(room, 0, 1, 2, 1000);
    expect(room.progress).toEqual([0, 0]);
    expect(msgs(miss, "miss")[0]).toMatchObject({ to: 0, msg: { t: "miss", ms: race.MISS_MS } });
    // still frozen, even with the right number
    expect(race.tap(room, 0, 1, 1, 1000 + race.MISS_MS - 1).events).toEqual([]);
    // after the freeze the right number counts
    race.tap(room, 0, 1, 1, 1000 + race.MISS_MS);
    expect(room.progress[0]).toBe(1);
  });

  it("a freeze on one player does not hold the other back", () => {
    const room = start();
    race.tap(room, 0, 1, 3, 0);
    race.tap(room, 1, 1, 1, 0);
    expect(room.progress).toEqual([0, 1]);
  });

  it("tapping a number already passed changes nothing and costs nothing", () => {
    const room = start();
    tapUpTo(room, 0, 3);
    const out = race.tap(room, 0, 1, 2, 5000);
    expect(out.events).toEqual([]);
    expect(room.frozen[0]).toBe(0);
    expect(room.progress[0]).toBe(3);
  });

  it("numbers that are not on the table are ignored", () => {
    const room = start();
    expect(race.tap(room, 0, 1, 0, 0).events).toEqual([]);
    expect(race.tap(room, 0, 1, 26, 0).events).toEqual([]);
    expect(race.tap(room, 0, 1, 1.5, 0).events).toEqual([]);
    expect(room.progress).toEqual([0, 0]);
  });

  it("taps for an old table or outside a round are ignored", () => {
    const room = start();
    expect(race.tap(room, 0, 2, 1, 0).events).toEqual([]);
    expect(race.tap(room, 0, NaN, 1, 0).events).toEqual([]);
    room.phase = "between";
    expect(race.tap(room, 0, 1, 1, 0).events).toEqual([]);
  });
});

describe("finishing a table", () => {
  it("the first to tap all 25 wins the table", () => {
    const room = start();
    const out = tapUpTo(room, 1, 25, 9000);
    expect(room.score).toEqual([0, 1]);
    expect(room.phase).toBe("between");
    expect(msgs(out!, "result")[0].msg).toMatchObject({ winner: 1, reason: "done", score: [0, 1] });
    expect(kinds(out!)).toEqual(["next"]);
  });

  it("when the time runs out the player further along wins the table", () => {
    const room = start();
    tapUpTo(room, 0, 12);
    tapUpTo(room, 1, 9);
    const out = race.roundTimeout(room, 1);
    expect(room.score).toEqual([1, 0]);
    expect(msgs(out, "result")[0].msg).toMatchObject({ winner: 0, reason: "time" });
  });

  it("a tie on time gives nobody the table", () => {
    const room = start();
    tapUpTo(room, 0, 5);
    tapUpTo(room, 1, 5);
    race.roundTimeout(room, 1);
    expect(room.score).toEqual([0, 0]);
  });

  it("a timer for a table that is already decided does nothing", () => {
    const room = start();
    tapUpTo(room, 0, 25);
    expect(race.roundTimeout(room, 1).events).toEqual([]);
    expect(room.score).toEqual([1, 0]);
  });
});

describe("the whole match", () => {
  it("three tables; the player with more tables wins", () => {
    const room = start();
    for (let t = 1; t <= race.ROUNDS; t++) {
      tapUpTo(room, 0, 25);
      const next = race.nextTimeout(room, t);
      if (t < race.ROUNDS) {
        expect(room.phase).toBe("round");
        expect(room.progress).toEqual([0, 0]);
      } else {
        expect(room.phase).toBe("ended");
        expect(msgs(next, "end")[0].msg).toMatchObject({ winner: 0, score: [3, 0], reason: "finished" });
      }
    }
  });

  it("a tie in tables is a draw", () => {
    const room = start();
    room.score = [1, 1];
    room.round = race.ROUNDS - 1;
    tapUpTo(room, 0, 25);
    expect(room.score).toEqual([2, 1]);
    room.score = [1, 1];
    room.round = race.ROUNDS;
    room.phase = "between";
    const end = race.nextTimeout(room, race.ROUNDS);
    expect(msgs(end, "end")[0].msg).toMatchObject({ winner: -1 });
  });
});

describe("disconnects", () => {
  it("a player who drops mid-table gets a window; coming back cancels the forfeit", () => {
    const room = start();
    const left = race.leave(room, 1);
    expect(kinds(left)).toEqual(["away"]);
    race.join(room, "u2", "Leyla");
    expect(race.awayTimeout(room, 1).events).toEqual([]);
  });

  it("not coming back in time forfeits the match", () => {
    const room = start();
    race.leave(room, 1);
    expect(msgs(race.awayTimeout(room, 1), "end")[0].msg).toMatchObject({ winner: 0, reason: "forfeit" });
  });

  it("a player who comes back mid-table gets the same table with the time left and both progress numbers", () => {
    const room = start();
    tapUpTo(room, 0, 4);
    const events = race.resume(room, 0, 12345);
    expect(events).toEqual([{ to: 0, msg: expect.objectContaining({ t: "round", n: 1, ms: 12345, progress: [4, 0] }) }]);
    expect((events[0].msg.grid as number[]).length).toBe(25);
  });
});

describe("engine adapter", () => {
  it("ignores messages that are not taps", () => {
    const room = start();
    expect(race.raceEngine.act(room, 0, { t: "hello" }, 0).events).toEqual([]);
  });

  it("reports the round as live only during a table", () => {
    const room = race.createRace(3);
    expect(race.raceEngine.inRound(room)).toBe(false);
    race.join(room, "u1", "Əli");
    race.join(room, "u2", "Leyla");
    race.countdownDone(room);
    expect(race.raceEngine.inRound(room)).toBe(true);
  });
});
