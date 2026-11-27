import { describe, expect, it } from "vitest";
import { MATCH } from "../config/match";
import * as duel from "../worker/duel5-core";
import type { Ev, Slot, Timer } from "../worker/engine";

// A small clock for the match: runs the timers it is given in time order, like the Room host does.
interface Sim {
  room: duel.Match;
  now: number;
  q: { at: number; t: Timer }[];
  events: Ev[];
  result?: unknown;
}

function sim(room: duel.Match, out: duel.Out, now = 1_000): Sim {
  const s: Sim = { room, now, q: [], events: [] };
  absorb(s, out);
  return s;
}

function absorb(s: Sim, out: duel.Out) {
  s.room = out.room;
  s.events.push(...out.events);
  if (out.result) s.result = out.result;
  for (const t of out.timers) s.q.push({ at: s.now + t.ms, t });
}

function step(s: Sim): boolean {
  if (!s.q.length) return false;
  s.q.sort((a, b) => a.at - b.at);
  const next = s.q.shift()!;
  s.now = Math.max(s.now, next.at);
  absorb(s, duel.timer(s.room, next.t, s.now));
  return true;
}

function runUntilEnd(s: Sim, max = 20000) {
  let i = 0;
  while (s.room.phase !== "ended" && i++ < max && step(s));
  return s;
}

/** Both players seated: the first stage's countdown is running. */
function twoPlayers(seed = 42, mode: duel.MatchMode = "rated") {
  const room = duel.createMatch(seed, { code: "TEST01", mode, expect: null });
  duel.join(room, "u1", "Əli");
  const second = duel.join(room, "u2", "Leyla");
  return sim(room, second);
}

describe("the match starts", () => {
  it("both players seated start the first discipline with the countdown", () => {
    const room = duel.createMatch(7, { code: "A", mode: "friendly", expect: null });
    const first = duel.join(room, "u1", "Əli");
    expect(room.phase).toBe("lobby");
    expect(first.events.some((e) => e.msg.t === "countdown")).toBe(false);
    const second = duel.join(room, "u2", "Leyla");
    expect(room.phase).toBe("stage");
    expect(room.stage).toBe(0);
    expect(room.plan.map((p) => p.id)).toEqual(MATCH.stages.map((p) => p.id));
    const cd = second.events.filter((e) => e.msg.t === "countdown");
    expect(cd).toHaveLength(1);
    expect(cd[0].msg).toMatchObject({ stage: 0, sid: "reaction" });
    expect(second.timers.some((t) => t.kind === "countdown" && t.stage === 0)).toBe(true);
  });

  it("the stage is the same for both players: the same seed and the same first waits", () => {
    const a = twoPlayers(99);
    const b = twoPlayers(99);
    expect(a.room.sub).toEqual(b.room.sub);
  });

  it("a player who is not invited cannot take a seat", () => {
    const room = duel.createMatch(3, { code: "B", mode: "rated", expect: ["u1", "u2"] });
    expect(duel.join(room, "u9", "Kənan").error).toBe("not_invited");
    expect(duel.join(room, "u1", "Əli").error).toBeUndefined();
  });

  it("a lobby nobody else joins closes as no-show, with no result to store", () => {
    const room = duel.createMatch(5, { code: "C", mode: "rated", expect: null });
    duel.join(room, "u1", "Əli");
    const s = runUntilEnd(sim(room, duel.timer(room, { kind: "lobby", ms: MATCH.lobbyMs }, 0)));
    expect(s.room.reason).toBe("no_show");
    expect(s.result).toBeUndefined();
  });
});

describe("a whole match", () => {
  it("two silent players draw every discipline; sudden death also draws, so the match is a rated draw", () => {
    const s = runUntilEnd(twoPlayers(11, "rated"));
    expect(s.room.phase).toBe("ended");
    expect(s.room.points).toEqual([0, 0]);
    expect(s.room.history).toHaveLength(MATCH.stages.length + MATCH.maxSuddenDeaths);
    expect(s.room.history.every((h) => h.winner === -1)).toBe(true);
    expect(s.room.winner).toBe(-1);
    expect(s.result).toMatchObject({ winner: -1, rated: true, reason: "finished", points: [0, 0] });
    const end = s.events.filter((e) => e.msg.t === "end");
    expect(end).toHaveLength(1);
  });

  it("a stage with no winner gives nobody a point (an explicit tie)", () => {
    const s = runUntilEnd(twoPlayers(12, "rated"));
    expect(s.events.filter((e) => e.msg.t === "stage_end").every((e) => e.msg.winner === -1)).toBe(true);
    expect(s.room.points).toEqual([0, 0]);
  });

  it("a bot match plays all five disciplines against a human who never taps; the bot wins; it is not rated", () => {
    const room = duel.createMatch(21, { code: "BOT1", mode: "training", expect: ["u1"], bot: "ekspert" });
    expect(room.nicks[1]).toMatch(/BOT/);
    const start = duel.join(room, "u1", "Əli");
    expect(room.phase).toBe("stage");
    const s = runUntilEnd(sim(room, start));
    expect(s.room.phase).toBe("ended");
    expect(s.result).toMatchObject({ rated: false, winner: 1, bots: [null, "ekspert"] });
    expect(s.room.history.length).toBeGreaterThanOrEqual(MATCH.stages.length);
    // the bot's wins are shown as stage results, never as a real player
    expect(s.events.some((e) => e.msg.t === "stage_end" && e.msg.winner === 1)).toBe(true);
  });

  it("stage messages carry the stage number and id, so the client shows the right discipline", () => {
    const s = runUntilEnd(twoPlayers(31, "friendly"));
    const tagged = s.events.filter((e) => !(["end", "welcome", "opponent"] as unknown[]).includes(e.msg.t));
    expect(tagged.length).toBeGreaterThan(0);
    for (const e of tagged) {
      expect(typeof e.msg.stage).toBe("number");
      expect(typeof e.msg.sid).toBe("string");
    }
    expect(new Set(tagged.map((e) => e.msg.sid))).toContain("reaction");
  });

  it("a friendly match is never rated", () => {
    const s = runUntilEnd(twoPlayers(41, "friendly"));
    expect(s.result).toMatchObject({ rated: false });
  });
});

describe("tie-breaks and stale moves", () => {
  it("a tie on points after the five stages goes to a one-round reaction, not a random winner", () => {
    const s = runUntilEnd(twoPlayers(51, "rated"));
    const sudden = s.room.history.slice(MATCH.stages.length);
    expect(sudden).toHaveLength(MATCH.maxSuddenDeaths);
    expect(sudden.every((h) => h.id === "sudden")).toBe(true);
  });

  it("a move tagged with another stage does nothing", () => {
    const s = twoPlayers(61);
    const before = JSON.stringify(s.room.sub);
    const out = duel.act(s.room, 0, { t: "tap", round: 1, stage: 3 }, s.now);
    expect(out.events).toEqual([]);
    expect(JSON.stringify(s.room.sub)).toBe(before);
  });

  it("taps after the match ended change nothing", () => {
    const s = runUntilEnd(twoPlayers(71, "rated"));
    expect(duel.act(s.room, 0, { t: "tap", round: 1 }, s.now).events).toEqual([]);
    expect(duel.timer(s.room, { kind: "round", ms: 0, round: 1, stage: 0 }, s.now).events).toEqual([]);
  });
});

describe("disconnects and reconnects", () => {
  it("a player who leaves waits for the other side, which sees them away", () => {
    const s = twoPlayers(81);
    const out = duel.leave(s.room, 1);
    expect(out.events[0].msg).toMatchObject({ t: "opponent", state: "away" });
    expect(out.timers).toEqual([{ kind: "away", ms: MATCH.awayMs, slot: 1 }]);
    expect(s.room.online[1]).toBe(false);
  });

  it("coming back before the window closes keeps the match going", () => {
    const s = twoPlayers(82);
    duel.leave(s.room, 1);
    duel.join(s.room, "u2", "Leyla");
    expect(duel.awayTimeout(s.room, 1).events).toEqual([]);
    expect(s.room.phase).toBe("stage");
    expect(s.room.online[1]).toBe(true);
  });

  it("not coming back in time loses the whole match by forfeit", () => {
    const s = twoPlayers(83, "rated");
    duel.leave(s.room, 1);
    const end = runUntilEnd(sim(s.room, duel.timer(s.room, { kind: "away", ms: 0, slot: 1 }, s.now)));
    expect(end.room.reason).toBe("forfeit");
    expect(end.room.winner).toBe(0);
    expect(end.result).toMatchObject({ winner: 0, reason: "forfeit", rated: true });
  });

  it("a player who leaves the lobby frees the seat", () => {
    const room = duel.createMatch(84, { code: "D", mode: "friendly", expect: null });
    duel.join(room, "u1", "Əli");
    duel.leave(room, 0);
    expect(room.ids[0]).toBeNull();
    expect(duel.join(room, "u3", "Nigar").error).toBeUndefined();
  });

  it("resuming mid-stage gives the stage's own state with the time left", () => {
    const s = twoPlayers(85);
    step(s); // the countdown is over: the first reaction round is waiting for its signal
    expect(duel.inRound(s.room)).toBe(true);
    const resumed = duel.resume(s.room, 0, 1234);
    expect(resumed).toHaveLength(1);
    expect(resumed[0]).toMatchObject({ to: 0, msg: { t: "ready", ms: 1234, stage: 0, sid: "reaction" } });
  });
});
