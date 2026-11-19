// "Həyəcan" (reaction): a signal comes after a random wait. The first to tap after the signal wins the round.
// Tapping before the signal puts that player out of the round. The reaction time is measured on the server.
// Pure game logic: the room host (worker/room.ts) runs the sockets and timers.
import { randInt, rng } from "../shared/rng";
import { none, type Engine, type Ev, type Out as EngineOut, type Slot, type Timer } from "./engine";
import { seatJoin, seatLeave } from "./lobby";

export const ROUNDS = 5;
export const COUNTDOWN_MS = 3000;
export const MIN_WAIT_MS = 1500;   // the random wait before the signal
export const MAX_WAIT_MS = 4000;
export const GO_MS = 3000;         // time to react once the signal is out
export const NEXT_MS = 1500;
export const AWAY_MS = 20000;

export type Phase = "lobby" | "countdown" | "ready" | "go" | "between" | "ended";

export interface Reaction {
  seed: number;
  phase: Phase;
  ids: [string | null, string | null];
  nicks: [string, string];
  online: [boolean, boolean];
  waits: number[];             // one wait per round, fixed when the room is made
  round: number;               // 0 before the first round
  goAt: number;                // server time of the signal
  locked: [boolean, boolean];  // a tap before the signal locks that player out of the round
  score: [number, number];
}

export type Out = EngineOut<Reaction>;

/** Same seed, same waits on every device. */
export function makeWaits(seed: number): number[] {
  const r = rng((seed ^ 0x5bd1e995) >>> 0);
  return Array.from({ length: ROUNDS }, () => randInt(r, MIN_WAIT_MS, MAX_WAIT_MS));
}

export function createReaction(seed: number): Reaction {
  return {
    seed,
    phase: "lobby",
    ids: [null, null],
    nicks: ["", ""],
    online: [false, false],
    waits: makeWaits(seed),
    round: 0,
    goAt: 0,
    locked: [false, false],
    score: [0, 0],
  };
}

const out = (room: Reaction, events: Ev[] = [], timers: Timer[] = [], error?: string): Out => ({ room, events, timers, error });

export function snapshot(room: Reaction) {
  return { phase: room.phase, round: room.round, total: ROUNDS, score: room.score, nicks: room.nicks, online: room.online };
}

export function join(room: Reaction, userId: string, nick: string): Out {
  const r = seatJoin(room, userId, nick, () => snapshot(room), COUNTDOWN_MS);
  return out(room, r.events, r.timers, r.error);
}

export function leave(room: Reaction, slot: Slot): Out {
  room.online[slot] = false;
  const r = seatLeave(room, slot, AWAY_MS);
  return out(room, r.events, r.timers);
}

export function awayTimeout(room: Reaction, slot: Slot): Out {
  if (room.phase === "ended" || room.online[slot]) return none(room);
  return finishGame(room, (1 - slot) as Slot, "forfeit");
}

function startRound(room: Reaction): Out {
  if (room.round >= ROUNDS) return endGame(room);
  room.round++;
  room.phase = "ready";
  room.locked = [false, false];
  room.goAt = 0;
  const ms = room.waits[room.round - 1];
  return out(room, [{ to: "all", msg: { t: "ready", n: room.round, total: ROUNDS, ms, locked: false } }], [{ kind: "go", ms, round: room.round }]);
}

export function countdownDone(room: Reaction): Out {
  if (room.phase !== "countdown") return none(room);
  return startRound(room);
}

/** The signal: from now on the reaction counts. */
export function goDone(room: Reaction, round: number, now: number): Out {
  if (room.phase !== "ready" || round !== room.round) return none(room);
  room.phase = "go";
  room.goAt = now;
  return out(room, [{ to: "all", msg: { t: "go", n: room.round, total: ROUNDS, ms: GO_MS, locked: false } }], [{ kind: "round", ms: GO_MS, round: room.round }]);
}

/** A tap from a player. Before the signal it is an early tap; after it, the first tap wins the round. */
export function tap(room: Reaction, slot: Slot, round: number, now: number): Out {
  if (round !== room.round || room.locked[slot]) return none(room);
  if (room.phase === "ready") {
    room.locked[slot] = true;
    const events: Ev[] = [{ to: slot, msg: { t: "early", n: room.round } }];
    if (room.locked[0] && room.locked[1]) {
      const done = finishRound(room, -1, "early", 0);
      return out(room, [...events, ...done.events], done.timers);
    }
    return out(room, events);
  }
  if (room.phase === "go") {
    const done = finishRound(room, slot, "fast", now - room.goAt);
    return out(room, done.events, done.timers);
  }
  return none(room);
}

/** The round is decided: the winner (or -1), the reaction time, the score, and a pause. */
function finishRound(room: Reaction, winner: Slot | -1, reason: "fast" | "early" | "time", ms: number): { events: Ev[]; timers: Timer[] } {
  room.phase = "between";
  if (winner === 0 || winner === 1) room.score[winner]++;
  return {
    events: [{ to: "all", msg: { t: "result", n: room.round, winner, reason, ms, score: room.score } }],
    timers: [{ kind: "next", ms: NEXT_MS, round: room.round }],
  };
}

/** Nobody tapped after the signal in time. */
export function goTimeout(room: Reaction, round: number): Out {
  if (room.phase !== "go" || round !== room.round) return none(room);
  const done = finishRound(room, -1, "time", 0);
  return out(room, done.events, done.timers);
}

export function nextTimeout(room: Reaction, round: number): Out {
  if (room.phase !== "between" || round !== room.round) return none(room);
  return startRound(room);
}

function endGame(room: Reaction): Out {
  const winner = room.score[0] > room.score[1] ? 0 : room.score[1] > room.score[0] ? 1 : -1;
  return finishGame(room, winner as Slot | -1, "finished");
}

function finishGame(room: Reaction, winner: Slot | -1, reason: "finished" | "forfeit"): Out {
  room.phase = "ended";
  return out(room, [{ to: "all", msg: { t: "end", score: room.score, winner, reason } }]);
}

/** A player who comes back: the same wait or the same signal window, with the time left and their lock. */
export function resume(room: Reaction, slot: Slot, msLeft: number): Ev[] {
  if (room.phase === "ready") {
    return [{ to: slot, msg: { t: "ready", n: room.round, total: ROUNDS, ms: msLeft, locked: room.locked[slot] } }];
  }
  if (room.phase === "go") {
    return [{ to: slot, msg: { t: "go", n: room.round, total: ROUNDS, ms: msLeft, locked: room.locked[slot] } }];
  }
  return [];
}

/** The room host talks to this game through the adapter below (see worker/engine.ts). */
export const reactionEngine: Engine<Reaction> = {
  create: createReaction,
  join,
  leave,
  timer: (room, t, now) => timerEvent(room, t, now),
  act: (room, slot, msg, now) => (msg.t === "tap" ? tap(room, slot, Number(msg.round), now) : none(room)),
  inRound: (room) => room.phase === "ready" || room.phase === "go",
  resume: (room, slot, msLeft) => resume(room, slot, msLeft),
  ended: (room) => room.phase === "ended",
};

function timerEvent(room: Reaction, t: Timer, now: number): Out {
  switch (t.kind) {
    case "countdown": return countdownDone(room);
    case "go": return goDone(room, t.round!, now);
    case "round": return goTimeout(room, t.round!);
    case "next": return nextTimeout(room, t.round!);
    case "away": return awayTimeout(room, t.slot!);
    default: return none(room);
  }
}
