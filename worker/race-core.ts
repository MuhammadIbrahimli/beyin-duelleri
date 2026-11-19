// "Sürətli sıra" (fast sequence): both players get the same 5×5 table with the numbers 1–25 shuffled.
// Tap 1, then 2, and so on up to 25. The first to finish the table wins the round. If time runs out,
// whoever got further wins. Pure game logic: the room host (worker/room.ts) runs the sockets and timers.
import { rng, shuffle } from "../shared/rng";
import { none, type Engine, type Ev, type Out as EngineOut, type Slot, type Timer } from "./engine";
import { seatJoin, seatLeave } from "./lobby";

export const ROUNDS = 3;
export const SIZE = 5;
export const CELLS = SIZE * SIZE;
export const COUNTDOWN_MS = 3000;
export const ROUND_MS = 30000;   // time for one table
export const NEXT_MS = 2000;     // pause between tables
export const AWAY_MS = 20000;    // a player who lost the connection has this long to come back
export const MISS_MS = 700;      // a wrong number freezes that player's taps for this long

export type Phase = "lobby" | "countdown" | "round" | "between" | "ended";

export interface Race {
  seed: number;
  phase: Phase;
  ids: [string | null, string | null];
  nicks: [string, string];
  online: [boolean, boolean];
  grids: number[][];           // one shuffled table per round, fixed when the room is made
  round: number;               // 0 before the first table
  progress: [number, number];  // how many numbers each player has tapped in order
  frozen: [number, number];    // taps are ignored until this time (after a wrong number)
  score: [number, number];
}

export type Out = EngineOut<Race>;

/** Same seed, same tables on every device. Each round gets its own shuffle. */
export function makeGrids(seed: number): number[][] {
  const numbers = Array.from({ length: CELLS }, (_, i) => i + 1);
  return Array.from({ length: ROUNDS }, (_, i) => shuffle(rng((seed + Math.imul(i + 1, 0x9e3779b1)) >>> 0), numbers));
}

export function createRace(seed: number): Race {
  return {
    seed,
    phase: "lobby",
    ids: [null, null],
    nicks: ["", ""],
    online: [false, false],
    grids: makeGrids(seed),
    round: 0,
    progress: [0, 0],
    frozen: [0, 0],
    score: [0, 0],
  };
}

const out = (room: Race, events: Ev[] = [], timers: Timer[] = [], error?: string): Out => ({ room, events, timers, error });

export function snapshot(room: Race) {
  return { phase: room.phase, round: room.round, total: ROUNDS, score: room.score, nicks: room.nicks, online: room.online, progress: room.progress };
}

export function join(room: Race, userId: string, nick: string): Out {
  const r = seatJoin(room, userId, nick, () => snapshot(room), COUNTDOWN_MS);
  return out(room, r.events, r.timers, r.error);
}

export function leave(room: Race, slot: Slot): Out {
  room.online[slot] = false;
  const r = seatLeave(room, slot, AWAY_MS);
  return out(room, r.events, r.timers);
}

/** The away timer ran out: the player who did not come back loses by forfeit. */
export function awayTimeout(room: Race, slot: Slot): Out {
  if (room.phase === "ended" || room.online[slot]) return none(room);
  return finishGame(room, (1 - slot) as Slot, "forfeit");
}

/** The table message. `ms` is the time left: the full round at the start, less on a reconnect. */
function tableMsg(room: Race, ms: number): Ev["msg"] {
  return { t: "round", n: room.round, total: ROUNDS, size: SIZE, grid: room.grids[room.round - 1], ms, progress: room.progress };
}

function startRound(room: Race): Out {
  if (room.round >= ROUNDS) return endGame(room);
  room.round++;
  room.phase = "round";
  room.progress = [0, 0];
  room.frozen = [0, 0];
  return out(room, [{ to: "all", msg: tableMsg(room, ROUND_MS) }], [{ kind: "round", ms: ROUND_MS, round: room.round }]);
}

export function countdownDone(room: Race): Out {
  if (room.phase !== "countdown") return none(room);
  return startRound(room);
}

/** A tap on a number. Taps out of order cost a short freeze; repeats and numbers off the table change nothing. */
export function tap(room: Race, slot: Slot, round: number, value: number, now: number): Out {
  if (room.phase !== "round" || round !== room.round) return none(room);
  const mine = room.progress[slot];
  if (!Number.isInteger(value) || value <= mine || value > CELLS) return none(room);
  if (now < room.frozen[slot]) return none(room);
  if (value !== mine + 1) {
    room.frozen[slot] = now + MISS_MS;
    return out(room, [{ to: slot, msg: { t: "miss", ms: MISS_MS } }]);
  }
  room.progress[slot] = mine + 1;
  const events: Ev[] = [{ to: "all", msg: { t: "progress", progress: room.progress } }];
  if (room.progress[slot] === CELLS) {
    const done = finishRound(room, slot, "done");
    return out(room, [...events, ...done.events], done.timers);
  }
  return out(room, events);
}

/** The round is decided: a winner (or -1 for a tie on time) and a pause before the next table. */
function finishRound(room: Race, winner: Slot | -1, reason: "done" | "time"): { events: Ev[]; timers: Timer[] } {
  room.phase = "between";
  if (winner === 0 || winner === 1) room.score[winner]++;
  return {
    events: [{ to: "all", msg: { t: "result", n: room.round, winner, reason, progress: room.progress, score: room.score } }],
    timers: [{ kind: "next", ms: NEXT_MS, round: room.round }],
  };
}

export function roundTimeout(room: Race, round: number): Out {
  if (room.phase !== "round" || round !== room.round) return none(room);
  const [a, b] = room.progress;
  const winner = a > b ? 0 : b > a ? 1 : -1;
  const done = finishRound(room, winner as Slot | -1, "time");
  return out(room, done.events, done.timers);
}

export function nextTimeout(room: Race, round: number): Out {
  if (room.phase !== "between" || round !== room.round) return none(room);
  return startRound(room);
}

function endGame(room: Race): Out {
  const winner = room.score[0] > room.score[1] ? 0 : room.score[1] > room.score[0] ? 1 : -1;
  return finishGame(room, winner as Slot | -1, "finished");
}

function finishGame(room: Race, winner: Slot | -1, reason: "finished" | "forfeit"): Out {
  room.phase = "ended";
  return out(room, [{ to: "all", msg: { t: "end", score: room.score, winner, reason } }]);
}

/** A player comes back in the middle of a table: they get the same table with the time left and the progress so far. */
export function resume(room: Race, slot: Slot, msLeft: number): Ev[] {
  return [{ to: slot, msg: tableMsg(room, msLeft) }];
}

/** The room host talks to every live game through this adapter (see worker/engine.ts). */
export const raceEngine: Engine<Race> = {
  create: createRace,
  join,
  leave,
  awayTimeout,
  countdownDone: (room) => countdownDone(room),
  act: (room, slot, msg, now) =>
    msg.t === "tap" ? tap(room, slot, Number(msg.round), Number(msg.value), now) : none(room),
  roundTimeout: (room, round) => roundTimeout(room, round),
  nextTimeout: (room, round) => nextTimeout(room, round),
  inRound: (room) => room.phase === "round",
  resume: (room, slot, msLeft) => resume(room, slot, msLeft),
  ended: (room) => room.phase === "ended",
};
