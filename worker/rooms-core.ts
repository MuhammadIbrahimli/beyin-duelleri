// "İlk cavab" (first answer): two players see the same question at the same moment, the first correct tap wins the round.
// Pure game logic: no sockets, no timers. The room host (worker/room.ts) turns the events into messages and runs the timers.
import { randInt, rng, shuffle } from "../shared/rng";
import { none, type Engine, type Ev, type Out as EngineOut, type Slot, type Timer } from "./engine";
import { seatJoin, seatLeave } from "./lobby";

export const ROUNDS = 8;
export const COUNTDOWN_MS = 3000;
export const ROUND_MS = 8000;     // time to answer one question
export const NEXT_MS = 1500;      // pause between rounds
export const AWAY_MS = 20000;     // a player who lost the connection has this long to come back

export interface Question { text: string; options: number[]; answer: number }
export type Phase = "lobby" | "countdown" | "round" | "between" | "ended";

export interface Room {
  seed: number;
  phase: Phase;
  ids: [string | null, string | null];
  nicks: [string, string];
  online: [boolean, boolean];
  qs: Question[];
  round: number;               // 0 before the first question
  lock: [boolean, boolean];    // a wrong answer locks a player out of the current round
  score: [number, number];
}

export type Out = EngineOut<Room>;
export type { Ev, Slot, Timer } from "./engine";

export function makeQuestion(r: () => number): Question {
  const kind = randInt(r, 0, 2);
  let a: number, b: number, ans: number, text: string;
  if (kind === 0) { a = randInt(r, 11, 89); b = randInt(r, 11, 89); ans = a + b; text = `${a} + ${b}`; }
  else if (kind === 1) { a = randInt(r, 30, 99); b = randInt(r, 11, a - 1); ans = a - b; text = `${a} − ${b}`; }
  else { a = randInt(r, 3, 9); b = randInt(r, 11, 19); ans = a * b; text = `${a} × ${b}`; }
  // three wrong options close to the right one, so that guessing does not work; never zero or negative
  const offsets = shuffle(r, [-10, -7, -5, -3, -2, -1, 1, 2, 3, 5, 7, 10].filter((o) => ans + o > 0));
  const wrong = offsets.slice(0, 3).map((o) => ans + o);
  const options = shuffle(r, [ans, ...wrong]);
  return { text, options, answer: options.indexOf(ans) };
}

export function createRoom(seed: number): Room {
  const r = rng(seed);
  return {
    seed,
    phase: "lobby",
    ids: [null, null],
    nicks: ["", ""],
    online: [false, false],
    qs: Array.from({ length: ROUNDS }, () => makeQuestion(r)),
    round: 0,
    lock: [false, false],
    score: [0, 0],
  };
}

const out = (room: Room, events: Ev[] = [], timers: Out["timers"] = [], error?: string): Out => ({ room, events, timers, error });

export function join(room: Room, userId: string, nick: string): Out {
  const r = seatJoin(room, userId, nick, () => snapshot(room), COUNTDOWN_MS);
  return out(room, r.events, r.timers, r.error);
}

export function leave(room: Room, slot: Slot): Out {
  room.online[slot] = false;
  const r = seatLeave(room, slot, AWAY_MS);
  return out(room, r.events, r.timers);
}

/** The away timer ran out: the player who did not come back loses by forfeit. */
export function awayTimeout(room: Room, slot: Slot): Out {
  if (room.phase === "ended" || room.online[slot]) return out(room);
  return finish(room, (1 - slot) as Slot, "forfeit");
}

export function countdownDone(room: Room): Out {
  if (room.phase !== "countdown") return out(room);
  return nextRound(room);
}

function nextRound(room: Room): Out {
  if (room.round >= ROUNDS) return endGame(room);
  room.round++;
  room.phase = "round";
  room.lock = [false, false];
  const q = room.qs[room.round - 1];
  return out(
    room,
    [{ to: "all", msg: { t: "round", n: room.round, total: ROUNDS, text: q.text, options: q.options, ms: ROUND_MS } }],
    [{ kind: "round", ms: ROUND_MS, round: room.round }],
  );
}

function endGame(room: Room): Out {
  const winner = room.score[0] > room.score[1] ? 0 : room.score[1] > room.score[0] ? 1 : -1;
  return finish(room, winner as Slot | -1, "finished");
}

function finish(room: Room, winner: Slot | -1, reason: "finished" | "forfeit"): Out {
  room.phase = "ended";
  return out(room, [{ to: "all", msg: { t: "end", score: room.score, winner, reason } }]);
}

/** A tap on an option. Only the first correct tap in a round counts; a wrong tap locks that player for the round. */
export function answer(room: Room, slot: Slot, round: number, choice: number): Out {
  if (room.phase !== "round" || round !== room.round || room.lock[slot]) return out(room);
  const q = room.qs[room.round - 1];
  if (choice === q.answer) {
    room.score[slot]++;
    room.phase = "between";
    return out(
      room,
      [{ to: "all", msg: { t: "won", n: room.round, winner: slot, answer: q.options[q.answer], score: room.score } }],
      [{ kind: "next", ms: NEXT_MS, round: room.round }],
    );
  }
  room.lock[slot] = true;
  const events: Ev[] = [{ to: slot, msg: { t: "lock", n: room.round } }];
  if (room.lock[0] && room.lock[1]) {
    const timeout = timeoutEvents(room);
    return out(room, [...events, ...timeout], [{ kind: "next", ms: NEXT_MS, round: room.round }]);
  }
  return out(room, events);
}

function timeoutEvents(room: Room): Ev[] {
  room.phase = "between";
  const q = room.qs[room.round - 1];
  return [{ to: "all", msg: { t: "timeout", n: room.round, answer: q.options[q.answer], score: room.score } }];
}

/** The round clock ran out with nobody right. */
export function roundTimeout(room: Room, round: number): Out {
  if (room.phase !== "round" || round !== room.round) return out(room);
  return out(room, timeoutEvents(room), [{ kind: "next", ms: NEXT_MS, round }]);
}

/** Pause between rounds is over: the next question, or the end of the game. */
export function nextTimeout(room: Room, round: number): Out {
  if (room.phase !== "between" || round !== room.round) return out(room);
  return nextRound(room);
}

export function snapshot(room: Room) {
  return { phase: room.phase, round: room.round, total: ROUNDS, score: room.score, nicks: room.nicks, online: room.online };
}

function timerEvent(room: Room, t: Timer): Out {
  switch (t.kind) {
    case "countdown": return countdownDone(room);
    case "round": return roundTimeout(room, t.round!);
    case "next": return nextTimeout(room, t.round!);
    case "away": return awayTimeout(room, t.slot!);
    default: return none(room);
  }
}

/** The room host talks to every live game through this adapter (see worker/engine.ts). */
export const firstEngine: Engine<Room> = {
  create: createRoom,
  join,
  leave,
  timer: (room, t) => timerEvent(room, t),
  act: (room, slot, msg) =>
    msg.t === "tap" && Number.isInteger(msg.round) && Number.isInteger(msg.choice)
      ? answer(room, slot, msg.round as number, msg.choice as number)
      : none(room),
  inRound: (room) => room.phase === "round",
  resume: (room, slot, msLeft) => {
    const q = room.qs[room.round - 1];
    return [{ to: slot, msg: { t: "round", n: room.round, total: ROUNDS, text: q.text, options: q.options, ms: msLeft } }];
  },
  ended: (room) => room.phase === "ended",
};
