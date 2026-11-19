// "Tapmaca yarışı" (riddle race): both players see the same riddle and four answers. The first correct tap wins the round.
// A wrong tap does not lock the player out: it freezes their taps for a moment and the round goes on.
// Pure game logic: the room host (worker/room.ts) runs the sockets and timers.
import { RIDDLES } from "../config/riddles";
import { rng, shuffle } from "../shared/rng";
import { none, type Engine, type Ev, type Out as EngineOut, type Slot, type Timer } from "./engine";
import { seatJoin, seatLeave } from "./lobby";

export const ROUNDS = 5;
export const COUNTDOWN_MS = 3000;
export const ROUND_MS = 15000;   // time to find the answer to one riddle
export const MISS_MS = 1000;     // a wrong answer freezes that player's taps for this long
export const NEXT_MS = 2000;
export const AWAY_MS = 20000;

export type Phase = "lobby" | "countdown" | "round" | "between" | "ended";

export interface Question {
  text: string;
  options: string[];
  answer: number;   // index into options
}

export interface Riddle {
  seed: number;
  phase: Phase;
  ids: [string | null, string | null];
  nicks: [string, string];
  online: [boolean, boolean];
  qs: Question[];             // one riddle per round, fixed when the room is made
  round: number;              // 0 before the first riddle
  frozen: [number, number];   // taps are ignored until this time (after a wrong answer)
  score: [number, number];
}

export type Out = EngineOut<Riddle>;

/** Same seed, same riddles and option order on every device. No riddle comes twice in one match. */
export function makeQuestions(seed: number): Question[] {
  const r = rng(seed);
  const picks = shuffle(r, RIDDLES.map((_, i) => i)).slice(0, ROUNDS);
  return picks.map((i) => {
    const riddle = RIDDLES[i];
    const options = shuffle(r, [riddle.answer, ...riddle.wrong]);
    return { text: riddle.text, options, answer: options.indexOf(riddle.answer) };
  });
}

export function createRiddle(seed: number): Riddle {
  return {
    seed,
    phase: "lobby",
    ids: [null, null],
    nicks: ["", ""],
    online: [false, false],
    qs: makeQuestions(seed),
    round: 0,
    frozen: [0, 0],
    score: [0, 0],
  };
}

const out = (room: Riddle, events: Ev[] = [], timers: Timer[] = [], error?: string): Out => ({ room, events, timers, error });

export function snapshot(room: Riddle) {
  return { phase: room.phase, round: room.round, total: ROUNDS, score: room.score, nicks: room.nicks, online: room.online };
}

export function join(room: Riddle, userId: string, nick: string): Out {
  const r = seatJoin(room, userId, nick, () => snapshot(room), COUNTDOWN_MS);
  return out(room, r.events, r.timers, r.error);
}

export function leave(room: Riddle, slot: Slot): Out {
  room.online[slot] = false;
  const r = seatLeave(room, slot, AWAY_MS);
  return out(room, r.events, r.timers);
}

export function awayTimeout(room: Riddle, slot: Slot): Out {
  if (room.phase === "ended" || room.online[slot]) return none(room);
  return finishGame(room, (1 - slot) as Slot, "forfeit");
}

/** The round message: the riddle and its four options. The right option is not sent. */
function roundMsg(room: Riddle, ms: number) {
  const q = room.qs[room.round - 1];
  return { t: "round", n: room.round, total: ROUNDS, text: q.text, options: q.options, ms };
}

function startRound(room: Riddle): Out {
  if (room.round >= ROUNDS) return endGame(room);
  room.round++;
  room.phase = "round";
  room.frozen = [0, 0];
  return out(room, [{ to: "all", msg: roundMsg(room, ROUND_MS) }], [{ kind: "round", ms: ROUND_MS, round: room.round }]);
}

export function countdownDone(room: Riddle): Out {
  if (room.phase !== "countdown") return none(room);
  return startRound(room);
}

/** One answer from a player. Right: the round is theirs. Wrong: a short freeze, and the round goes on. */
export function answer(room: Riddle, slot: Slot, round: number, choice: number, now: number): Out {
  if (room.phase !== "round" || round !== room.round) return none(room);
  if (!Number.isInteger(choice) || choice < 0 || choice > 3) return none(room);
  if (now < room.frozen[slot]) return none(room);
  const q = room.qs[room.round - 1];
  if (choice !== q.answer) {
    room.frozen[slot] = now + MISS_MS;
    return out(room, [{ to: slot, msg: { t: "miss", ms: MISS_MS } }]);
  }
  const done = finishRound(room, slot, "fast");
  return out(room, done.events, done.timers);
}

/** The round is decided: the winner (or -1), the right answer, the score, and a pause. */
function finishRound(room: Riddle, winner: Slot | -1, reason: "fast" | "time"): { events: Ev[]; timers: Timer[] } {
  room.phase = "between";
  if (winner === 0 || winner === 1) room.score[winner]++;
  const q = room.qs[room.round - 1];
  return {
    events: [{ to: "all", msg: { t: "result", n: room.round, winner, reason, answer: q.options[q.answer], score: room.score } }],
    timers: [{ kind: "next", ms: NEXT_MS, round: room.round }],
  };
}

/** Nobody found the answer in time. */
export function roundTimeout(room: Riddle, round: number): Out {
  if (room.phase !== "round" || round !== room.round) return none(room);
  const done = finishRound(room, -1, "time");
  return out(room, done.events, done.timers);
}

export function nextTimeout(room: Riddle, round: number): Out {
  if (room.phase !== "between" || round !== room.round) return none(room);
  return startRound(room);
}

function endGame(room: Riddle): Out {
  const winner = room.score[0] > room.score[1] ? 0 : room.score[1] > room.score[0] ? 1 : -1;
  return finishGame(room, winner as Slot | -1, "finished");
}

function finishGame(room: Riddle, winner: Slot | -1, reason: "finished" | "forfeit"): Out {
  room.phase = "ended";
  return out(room, [{ to: "all", msg: { t: "end", score: room.score, winner, reason } }]);
}

/** A player who comes back mid-round gets the same riddle with the time left. */
export function resume(room: Riddle, slot: Slot, msLeft: number): Ev[] {
  if (room.phase !== "round") return [];
  return [{ to: slot, msg: roundMsg(room, msLeft) }];
}

/** The room host talks to this game through the adapter below (see worker/engine.ts). */
export const riddleEngine: Engine<Riddle> = {
  create: createRiddle,
  join,
  leave,
  timer: (room, t) => timerEvent(room, t),
  act: (room, slot, msg, now) =>
    msg.t === "tap" ? answer(room, slot, Number(msg.round), Number(msg.choice), now) : none(room),
  inRound: (room) => room.phase === "round",
  resume: (room, slot, msLeft) => resume(room, slot, msLeft),
  ended: (room) => room.phase === "ended",
};

function timerEvent(room: Riddle, t: Timer): Out {
  switch (t.kind) {
    case "countdown": return countdownDone(room);
    case "round": return roundTimeout(room, t.round!);
    case "next": return nextTimeout(room, t.round!);
    case "away": return awayTimeout(room, t.slot!);
    default: return none(room);
  }
}
