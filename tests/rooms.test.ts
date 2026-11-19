import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../worker/index";
import * as core from "../worker/rooms-core";
import { makeD1 } from "./d1shim";

const kinds = (out: core.Out) => out.timers.map((t) => t.kind);
const msgs = (out: core.Out, t: string) => out.events.filter((e) => e.msg.t === t);

/** Both players join; returns the room in the countdown phase. */
function start(seed = 12345) {
  const room = core.createRoom(seed);
  core.join(room, "u1", "Əli");
  const out = core.join(room, "u2", "Leyla");
  expect(out.room.phase).toBe("countdown");
  return room;
}

/** Answers the current question: correct for `winner`, nobody else answers. */
function winRound(room: core.Room, winner: core.Slot) {
  core.countdownDone(room);
  const r = room.round;
  const ans = room.qs[r - 1].answer;
  return core.answer(room, winner, r, ans);
}

describe("questions", () => {
  it("the marked answer is the arithmetic result, options are distinct and positive", () => {
    const room = core.createRoom(777);
    for (const q of room.qs) {
      const m = q.text.match(/^(\d+) ([+−×]) (\d+)$/);
      expect(m).not.toBeNull();
      const a = Number(m![1]), b = Number(m![3]);
      const expected = m![2] === "+" ? a + b : m![2] === "−" ? a - b : a * b;
      expect(q.options[q.answer]).toBe(expected);
      expect(new Set(q.options).size).toBe(4);
      expect(q.options.every((o) => o > 0)).toBe(true);
    }
  });

  it("the same seed gives the same eight questions on every device", () => {
    expect(core.createRoom(9).qs).toEqual(core.createRoom(9).qs);
    expect(core.createRoom(9).qs.length).toBe(core.ROUNDS);
    expect(core.createRoom(9).qs).not.toEqual(core.createRoom(10).qs);
  });
});

describe("joining", () => {
  it("the first player waits; the second starts the countdown for both", () => {
    const room = core.createRoom(1);
    const first = core.join(room, "u1", "Əli");
    expect(room.phase).toBe("lobby");
    expect(kinds(first)).toEqual([]);
    const second = core.join(room, "u2", "Leyla");
    expect(room.phase).toBe("countdown");
    expect(msgs(second, "countdown")[0].to).toBe("all");
    expect(kinds(second)).toEqual(["countdown"]);
    // each side learns the other's name
    expect(second.events.find((e) => e.to === 0)?.msg).toMatchObject({ t: "opponent", nick: "Leyla" });
    expect(second.events.find((e) => e.to === 1 && e.msg.t === "opponent")?.msg).toMatchObject({ t: "opponent", nick: "Əli" });
  });

  it("a third player is refused", () => {
    const room = start();
    const out = core.join(room, "u3", "Kənan");
    expect(out.error).toBe("full");
    expect(room.ids).toEqual(["u1", "u2"]);
  });

  it("a player who left the lobby frees the seat", () => {
    const room = core.createRoom(2);
    core.join(room, "u1", "Əli");
    core.leave(room, 0);
    expect(room.ids[0]).toBeNull();
    core.join(room, "u9", "Nigar");
    expect(room.ids[0]).toBe("u9");
  });

  it("a returning player gets the same seat back", () => {
    const room = start();
    core.leave(room, 1);
    const out = core.join(room, "u2", "Leyla");
    expect(out.error).toBeUndefined();
    expect(room.ids[1]).toBe("u2");
    expect(room.online[1]).toBe(true);
  });
});

describe("a round", () => {
  it("the first correct tap wins the round and the score goes up", () => {
    const room = start();
    const first = winRound(room, 0);
    expect(room.score).toEqual([1, 0]);
    expect(room.phase).toBe("between");
    expect(msgs(first, "won")[0].msg).toMatchObject({ winner: 0, n: 1, score: [1, 0] });
    expect(kinds(first)).toEqual(["next"]);
  });

  it("a wrong tap locks that player for this round only; the other can still win", () => {
    const room = start();
    core.countdownDone(room);
    const wrong = (room.qs[0].answer + 1) % 4;
    const miss = core.answer(room, 0, 1, wrong);
    expect(msgs(miss, "lock")[0].to).toBe(0);
    expect(room.phase).toBe("round");
    // the locked player cannot tap again in this round
    expect(core.answer(room, 0, 1, room.qs[0].answer).events).toEqual([]);
    const win = core.answer(room, 1, 1, room.qs[0].answer);
    expect(room.score).toEqual([0, 1]);
    expect(msgs(win, "won")[0].msg).toMatchObject({ winner: 1 });
  });

  it("when both have tapped wrong the round ends without a point", () => {
    const room = start();
    core.countdownDone(room);
    const wrong = (room.qs[0].answer + 1) % 4;
    core.answer(room, 0, 1, wrong);
    const out = core.answer(room, 1, 1, wrong);
    expect(msgs(out, "timeout")).toHaveLength(1);
    expect(room.score).toEqual([0, 0]);
    expect(room.phase).toBe("between");
    expect(kinds(out)).toEqual(["next"]);
  });

  it("a stale answer (old round, or after the round ended) is ignored", () => {
    const room = start();
    winRound(room, 0);
    expect(core.answer(room, 1, 1, room.qs[0].answer).events).toEqual([]);
    expect(room.score).toEqual([1, 0]);
  });

  it("when the clock runs out nobody scores and the next question waits", () => {
    const room = start();
    core.countdownDone(room);
    const out = core.roundTimeout(room, 1);
    expect(msgs(out, "timeout")[0].msg).toMatchObject({ n: 1, score: [0, 0] });
    expect(room.phase).toBe("between");
  });

  it("an old round timer does nothing after the round was already won", () => {
    const room = start();
    winRound(room, 0);
    expect(core.roundTimeout(room, 1).events).toEqual([]);
  });

  it("the pause moves to the next question, and round numbers stay in order", () => {
    const room = start();
    winRound(room, 0);
    const out = core.nextTimeout(room, 1);
    expect(room.round).toBe(2);
    expect(msgs(out, "round")[0].msg).toMatchObject({ n: 2, total: core.ROUNDS });
    expect(room.phase).toBe("round");
  });

  it("the question sent to the players does not reveal the right option", () => {
    const room = start();
    const first = core.countdownDone(room);
    const q = msgs(first, "round")[0].msg;
    expect(q).toMatchObject({ t: "round", n: 1, options: room.qs[0].options });
    expect(q).not.toHaveProperty("answer");
  });
});

describe("the whole game", () => {
  it("plays eight rounds; the player with more rounds won the game", () => {
    const room = start();
    core.countdownDone(room);
    for (let i = 1; i <= core.ROUNDS; i++) {
      const slot: core.Slot = i <= 5 ? 0 : 1;
      core.answer(room, slot, room.round, room.qs[room.round - 1].answer);
      const out = core.nextTimeout(room, room.round);
      if (i < core.ROUNDS) expect(room.phase).toBe("round");
      else {
        expect(room.phase).toBe("ended");
        expect(msgs(out, "end")[0].msg).toMatchObject({ winner: 0, score: [5, 3] });
      }
    }
  });

  it("an equal score at the end is a draw (winner -1)", () => {
    const room = start();
    core.countdownDone(room);
    room.round = core.ROUNDS;
    room.score = [3, 3];
    room.phase = "between";
    const end = core.nextTimeout(room, core.ROUNDS);
    expect(room.phase).toBe("ended");
    expect(msgs(end, "end")[0].msg).toMatchObject({ winner: -1, reason: "finished" });
  });

  it("a finished game ignores late taps and timers", () => {
    const room = start();
    room.phase = "ended";
    expect(core.answer(room, 0, 1, 0).events).toEqual([]);
    expect(core.roundTimeout(room, 1).events).toEqual([]);
    expect(core.leave(room, 1).events).toEqual([]);
  });
});

describe("disconnects", () => {
  it("in a game the other player waits, with a 20 second window", () => {
    const room = start();
    const out = core.leave(room, 1);
    expect(msgs(out, "opponent")[0]).toMatchObject({ to: 0 });
    expect(out.timers).toEqual([{ kind: "away", ms: core.AWAY_MS, slot: 1 }]);
    expect(room.online[1]).toBe(false);
  });

  it("coming back before the window closes cancels the forfeit", () => {
    const room = start();
    core.leave(room, 1);
    core.join(room, "u2", "Leyla");
    const out = core.awayTimeout(room, 1);
    expect(out.events).toEqual([]);
    expect(room.phase).toBe("countdown");
  });

  it("not coming back in time loses the game by forfeit", () => {
    const room = start();
    core.leave(room, 1);
    const out = core.awayTimeout(room, 1);
    expect(msgs(out, "end")[0].msg).toMatchObject({ winner: 0, reason: "forfeit" });
    expect(room.phase).toBe("ended");
  });
});

describe("POST /api/rooms and the socket route", () => {
  let env: any;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    env = { DB: makeD1(), SESSION_SECRET: "test-secret", SITE_ORIGIN: "", ADMIN_TOKEN: "admin-secret-token" };
  });
  afterEach(() => vi.useRealTimers());

  async function token() {
    const res = await app.request("/api/session", { method: "POST", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (Android 14)" }, body: JSON.stringify({ lang: "az" }) }, env);
    return ((await res.json()) as any).token as string;
  }

  it("needs a signed-in player to create a room", async () => {
    const res = await app.request("/api/rooms", { method: "POST" }, { ...env, ROOMS: {} });
    expect(res.status).toBe(401);
  });

  it("returns a six character code for a signed-in player", async () => {
    const t = await token();
    const res = await app.request("/api/rooms", { method: "POST", headers: { authorization: `Bearer ${t}` } }, { ...env, ROOMS: {} });
    expect(res.status).toBe(200);
    const { code } = (await res.json()) as any;
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
  });

  it("says the feature is unavailable when the Durable Object is not bound", async () => {
    const t = await token();
    const res = await app.request("/api/rooms", { method: "POST", headers: { authorization: `Bearer ${t}` } }, env);
    expect(res.status).toBe(503);
  });

  it("rejects a malformed room code and a plain GET without an upgrade", async () => {
    const bad = await app.request("/api/rooms/x!/ws", { headers: { upgrade: "websocket" } }, { ...env, ROOMS: {} });
    expect(bad.status).toBe(400);
    const plain = await app.request("/api/rooms/ABC123/ws", {}, { ...env, ROOMS: {} });
    expect(plain.status).toBe(426);
  });
});
