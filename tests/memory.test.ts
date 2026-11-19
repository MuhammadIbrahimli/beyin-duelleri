import { describe, expect, it } from "vitest";
import * as mem from "../worker/memory-core";

const kinds = (out: { timers: { kind: string }[] }) => out.timers.map((t) => t.kind);
const msgs = (out: { events: { to?: unknown; msg: Record<string, unknown> }[] }, t: string) => out.events.filter((e) => e.msg.t === t);

/** Two players seated, the first sequence is being shown. */
function start(seed = 515) {
  const room = mem.createMemory(seed);
  mem.join(room, "u1", "Əli");
  mem.join(room, "u2", "Leyla");
  mem.countdownDone(room);
  return room;
}

/** The watching is over: the repeat is open. */
function open(room: mem.Memory) {
  return mem.showDone(room, room.round);
}

/** Repeats the sequence for one player; returns the last outcome. */
function repeatAll(room: mem.Memory, slot: 0 | 1) {
  let last: ReturnType<typeof mem.tap> | null = null;
  for (const tile of room.seqs[room.round - 1].slice(room.progress[slot])) last = mem.tap(room, slot, room.round, tile);
  return last;
}

describe("sequences", () => {
  it("each round is longer than the one before, and tiles are on the board", () => {
    const seqs = mem.makeSequences(77);
    expect(seqs.map((s) => s.length)).toEqual(mem.LENGTHS);
    for (const s of seqs) for (const t of s) expect(t >= 0 && t < mem.TILES).toBe(true);
  });

  it("the same tile never comes twice in a row", () => {
    for (let seed = 1; seed < 40; seed++) {
      for (const s of mem.makeSequences(seed)) for (let i = 1; i < s.length; i++) expect(s[i]).not.toBe(s[i - 1]);
    }
  });

  it("the same seed gives the same sequences; rounds differ from each other", () => {
    expect(mem.makeSequences(9)).toEqual(mem.makeSequences(9));
    expect(mem.makeSequences(9)[0]).not.toEqual(mem.makeSequences(10)[0]);
  });
});

describe("showing the sequence", () => {
  it("both players get the sequence, the tile step and how long the watching lasts", () => {
    const room = mem.createMemory(3);
    mem.join(room, "u1", "Əli");
    mem.join(room, "u2", "Leyla");
    const out = mem.countdownDone(room);
    const show = msgs(out, "show")[0];
    expect(show.to).toBe("all");
    expect(show.msg).toMatchObject({ t: "show", n: 1, total: mem.ROUNDS, tiles: mem.TILES, step: mem.STEP_MS, ms: mem.showMs(4) });
    expect(show.msg.seq).toEqual(room.seqs[0]);
    expect(kinds(out)).toEqual(["show"]);
  });

  it("when the watching ends the repeat opens, with the timer for it", () => {
    const room = start();
    const out = open(room);
    expect(room.phase).toBe("input");
    expect(msgs(out, "input")[0].msg).toMatchObject({ t: "input", n: 1, len: 4, ms: mem.INPUT_MS, progress: [0, 0], locked: false });
    expect(kinds(out)).toEqual(["round"]);
  });

  it("no tap is accepted while the sequence is still being shown", () => {
    const room = start();
    expect(mem.tap(room, 0, 1, room.seqs[0][0]).events).toEqual([]);
    expect(room.progress).toEqual([0, 0]);
  });
});

describe("repeating the sequence", () => {
  it("each right tile moves that player on, and both sides hear about it", () => {
    const room = start();
    open(room);
    const out = mem.tap(room, 0, 1, room.seqs[0][0]);
    expect(room.progress).toEqual([1, 0]);
    expect(msgs(out, "progress")[0]).toMatchObject({ to: "all", msg: { progress: [1, 0] } });
  });

  it("a wrong tile locks only that player, who is told so", () => {
    const room = start();
    open(room);
    const wrong = (room.seqs[0][0] + 1) % mem.TILES;
    const out = mem.tap(room, 0, 1, wrong);
    expect(room.locked).toEqual([true, false]);
    expect(msgs(out, "lock")[0]).toMatchObject({ to: 0 });
    // locked: even the right tile does nothing now
    expect(mem.tap(room, 0, 1, room.seqs[0][0]).events).toEqual([]);
    expect(room.phase).toBe("input");
  });

  it("when both have been locked the round ends with nobody winning, and the sequence is revealed", () => {
    const room = start();
    open(room);
    const wrong = (room.seqs[0][0] + 1) % mem.TILES;
    mem.tap(room, 0, 1, wrong);
    const out = mem.tap(room, 1, 1, wrong);
    expect(room.phase).toBe("between");
    expect(msgs(out, "result")[0].msg).toMatchObject({ winner: -1, reason: "miss", seq: room.seqs[0] });
    expect(room.score).toEqual([0, 0]);
  });

  it("the first to repeat the whole sequence wins the round", () => {
    const room = start();
    open(room);
    const out = repeatAll(room, 1);
    expect(room.score).toEqual([0, 1]);
    expect(msgs(out!, "result")[0].msg).toMatchObject({ winner: 1, reason: "done" });
    expect(kinds(out!)).toEqual(["next"]);
  });

  it("a tile off the board is ignored", () => {
    const room = start();
    open(room);
    expect(mem.tap(room, 0, 1, 9).events).toEqual([]);
    expect(mem.tap(room, 0, 1, -1).events).toEqual([]);
    expect(mem.tap(room, 0, 1, 2.5).events).toEqual([]);
    expect(room.locked).toEqual([false, false]);
  });

  it("taps for an old round are ignored", () => {
    const room = start();
    open(room);
    expect(mem.tap(room, 0, 2, room.seqs[0][0]).events).toEqual([]);
  });
});

describe("when time runs out", () => {
  it("whoever got further wins the round; a tie gives nobody the round", () => {
    const room = start();
    open(room);
    mem.tap(room, 0, 1, room.seqs[0][0]);
    mem.tap(room, 0, 1, room.seqs[0][1]);
    mem.tap(room, 1, 1, room.seqs[0][0]);
    const out = mem.inputTimeout(room, 1);
    expect(room.score).toEqual([1, 0]);
    expect(msgs(out, "result")[0].msg).toMatchObject({ winner: 0, reason: "time" });
  });

  it("a tie on time is nobody's round", () => {
    const room = start();
    open(room);
    mem.inputTimeout(room, 1);
    expect(room.score).toEqual([0, 0]);
  });

  it("an old input timer does nothing after the round was won", () => {
    const room = start();
    open(room);
    repeatAll(room, 0);
    expect(mem.inputTimeout(room, 1).events).toEqual([]);
  });
});

describe("the whole match", () => {
  it("three rounds with longer sequences; the player with more rounds wins", () => {
    const room = start();
    for (let r = 1; r <= mem.ROUNDS; r++) {
      if (r > 1) expect(room.seqs[r - 1].length).toBe(mem.LENGTHS[r - 1]);
      open(room);
      repeatAll(room, 0);
      const next = mem.nextTimeout(room, r);
      if (r < mem.ROUNDS) expect(room.phase).toBe("show");
      else expect(msgs(next, "end")[0].msg).toMatchObject({ winner: 0, score: [3, 0] });
    }
  });
});

describe("disconnects and coming back", () => {
  it("a player who comes back while the sequence is shown gets it again with the time left", () => {
    const room = start();
    const events = mem.resume(room, 0, 1200);
    expect(events).toEqual([{ to: 0, msg: expect.objectContaining({ t: "show", ms: 1200, seq: room.seqs[0] }) }]);
  });

  it("a player who comes back during the repeat gets their progress and whether they are locked", () => {
    const room = start();
    open(room);
    mem.tap(room, 0, 1, room.seqs[0][0]);
    mem.tap(room, 1, 1, (room.seqs[0][0] + 1) % mem.TILES);
    const events = mem.resume(room, 1, 5000);
    expect(events).toEqual([{ to: 1, msg: expect.objectContaining({ t: "input", ms: 5000, progress: [1, 0], locked: true }) }]);
  });

  it("a player who drops is given a window; not coming back forfeits", () => {
    const room = start();
    expect(kinds(mem.leave(room, 1))).toEqual(["away"]);
    expect(msgs(mem.awayTimeout(room, 1), "end")[0].msg).toMatchObject({ winner: 0, reason: "forfeit" });
  });

  it("the engine adapter moves from the watching to the repeat when the show timer runs out", () => {
    const room = start();
    const out = mem.memoryEngine.timer(room, { kind: "show", ms: 0, round: 1 }, 0);
    expect(room.phase).toBe("input");
    expect(msgs(out, "input")).toHaveLength(1);
    expect(mem.memoryEngine.inRound(room)).toBe(true);
  });
});
