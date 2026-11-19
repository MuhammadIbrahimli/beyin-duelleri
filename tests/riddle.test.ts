import { describe, expect, it } from "vitest";
import { RIDDLES } from "../config/riddles";
import * as rd from "../worker/riddle-core";

const msgs = (out: { events: { to?: unknown; msg: Record<string, unknown> }[] }, t: string) => out.events.filter((e) => e.msg.t === t);
const kinds = (out: { timers: { kind: string }[] }) => out.timers.map((t) => t.kind);

/** Two players seated; the first riddle is up. */
function start(seed = 77) {
  const room = rd.createRiddle(seed);
  rd.join(room, "u1", "Əli");
  rd.join(room, "u2", "Leyla");
  rd.countdownDone(room);
  return room;
}

describe("the riddle bank", () => {
  it("has more riddles than a match needs", () => {
    expect(RIDDLES.length).toBeGreaterThanOrEqual(rd.ROUNDS * 3);
  });

  it("ids and riddle texts are unique", () => {
    expect(new Set(RIDDLES.map((r) => r.id)).size).toBe(RIDDLES.length);
    expect(new Set(RIDDLES.map((r) => r.text)).size).toBe(RIDDLES.length);
  });

  it("every riddle has one answer and three different wrong options", () => {
    for (const r of RIDDLES) {
      expect(r.text.trim().length).toBeGreaterThan(10);
      const all = [r.answer, ...r.wrong];
      expect(new Set(all).size).toBe(4);
      expect(r.wrong).toHaveLength(3);
    }
  });
});

describe("making a match", () => {
  it("each match has five different riddles with four options and a right one", () => {
    const qs = rd.makeQuestions(12);
    expect(qs).toHaveLength(rd.ROUNDS);
    expect(new Set(qs.map((q) => q.text)).size).toBe(rd.ROUNDS);
    for (const q of qs) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      const riddle = RIDDLES.find((r) => r.text === q.text)!;
      expect(q.options[q.answer]).toBe(riddle.answer);
    }
  });

  it("the same seed gives the same match; different seeds differ", () => {
    expect(rd.makeQuestions(3)).toEqual(rd.makeQuestions(3));
    expect(rd.makeQuestions(3)).not.toEqual(rd.makeQuestions(4));
  });
});

describe("rounds", () => {
  it("the riddle goes to both players without the right option", () => {
    const room = rd.createRiddle(9);
    rd.join(room, "u1", "Əli");
    rd.join(room, "u2", "Leyla");
    const out = rd.countdownDone(room);
    const round = msgs(out, "round")[0];
    expect(round.to).toBe("all");
    expect(round.msg).toMatchObject({ t: "round", n: 1, total: rd.ROUNDS, text: room.qs[0].text, ms: rd.ROUND_MS });
    expect(round.msg).not.toHaveProperty("answer");
    expect(kinds(out)).toEqual(["round"]);
  });
});

describe("answering", () => {
  it("the right answer wins the round and the score goes up", () => {
    const room = start();
    const out = rd.answer(room, 0, 1, room.qs[0].answer, 1000);
    expect(room.score).toEqual([1, 0]);
    expect(msgs(out, "result")[0].msg).toMatchObject({ winner: 0, reason: "fast", answer: room.qs[0].options[room.qs[0].answer], score: [1, 0] });
    expect(kinds(out)).toEqual(["next"]);
  });

  it("a wrong answer freezes only that player; they can answer again after the freeze", () => {
    const room = start();
    const wrong = (room.qs[0].answer + 1) % 4;
    const miss = rd.answer(room, 1, 1, wrong, 1000);
    expect(msgs(miss, "miss")[0]).toMatchObject({ to: 1, msg: { t: "miss", ms: rd.MISS_MS } });
    expect(room.phase).toBe("round");
    // still frozen: even the right answer is ignored
    expect(rd.answer(room, 1, 1, room.qs[0].answer, 1000 + rd.MISS_MS - 1).events).toEqual([]);
    // the other player is not frozen and can win
    rd.answer(room, 0, 1, room.qs[0].answer, 1000);
    expect(room.score).toEqual([1, 0]);
  });

  it("after the freeze the same player can still win the round", () => {
    const room = start();
    const wrong = (room.qs[0].answer + 1) % 4;
    rd.answer(room, 0, 1, wrong, 1000);
    rd.answer(room, 0, 1, room.qs[0].answer, 1000 + rd.MISS_MS);
    expect(room.score).toEqual([1, 0]);
  });

  it("an answer outside 0..3 or for an old round is ignored", () => {
    const room = start();
    expect(rd.answer(room, 0, 1, 4, 0).events).toEqual([]);
    expect(rd.answer(room, 0, 1, -1, 0).events).toEqual([]);
    expect(rd.answer(room, 0, 1, 1.5, 0).events).toEqual([]);
    expect(rd.answer(room, 0, 2, room.qs[0].answer, 0).events).toEqual([]);
    expect(room.score).toEqual([0, 0]);
  });

  it("when the time runs out nobody wins the round", () => {
    const room = start();
    const out = rd.roundTimeout(room, 1);
    expect(msgs(out, "result")[0].msg).toMatchObject({ winner: -1, reason: "time" });
    expect(room.score).toEqual([0, 0]);
  });

  it("an old round timer does nothing once the round is won", () => {
    const room = start();
    rd.answer(room, 0, 1, room.qs[0].answer, 0);
    expect(rd.roundTimeout(room, 1).events).toEqual([]);
  });
});

describe("the whole match", () => {
  it("five riddles; the player with more rounds wins", () => {
    const room = start();
    for (let r = 1; r <= rd.ROUNDS; r++) {
      rd.answer(room, 0, r, room.qs[r - 1].answer, r * 1000);
      const next = rd.nextTimeout(room, r);
      if (r < rd.ROUNDS) expect(room.phase).toBe("round");
      else expect(msgs(next, "end")[0].msg).toMatchObject({ winner: 0, score: [rd.ROUNDS, 0] });
    }
  });

  it("an equal score at the end is a draw", () => {
    const room = start();
    room.score = [2, 2];
    room.round = rd.ROUNDS;
    room.phase = "between";
    expect(msgs(rd.nextTimeout(room, rd.ROUNDS), "end")[0].msg).toMatchObject({ winner: -1 });
  });
});

describe("disconnects and coming back", () => {
  it("a player who comes back mid-round gets the riddle with the time left", () => {
    const room = start();
    expect(rd.resume(room, 0, 4000)).toEqual([{ to: 0, msg: expect.objectContaining({ t: "round", ms: 4000, text: room.qs[0].text }) }]);
  });

  it("a player who drops is given a window; not coming back forfeits", () => {
    const room = start();
    expect(kinds(rd.leave(room, 1))).toEqual(["away"]);
    expect(msgs(rd.awayTimeout(room, 1), "end")[0].msg).toMatchObject({ winner: 0, reason: "forfeit" });
  });

  it("the engine adapter takes a tap message and ignores others", () => {
    const room = start();
    expect(rd.riddleEngine.act(room, 0, { t: "hello" }, 0).events).toEqual([]);
    const out = rd.riddleEngine.act(room, 0, { t: "tap", round: 1, choice: room.qs[0].answer }, 0);
    expect(msgs(out, "result")).toHaveLength(1);
  });
});
