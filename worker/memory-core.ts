// "Yaddaş döyüşü" (memory battle): tiles on a 3×3 board light up one after another. Both players watch the same
// sequence, then repeat it. The first to tap the whole sequence right wins the round. A wrong tap locks that player
// out of the round. Pure game logic: the room host (worker/room.ts) runs the sockets and timers.
import { rng } from "../shared/rng";
import { none, type Engine, type Ev, type Out as EngineOut, type Slot, type Timer } from "./engine";
import { seatJoin, seatLeave } from "./lobby";

export const ROUNDS = 3;
export const TILES = 9;               // a 3×3 board
export const LENGTHS = [4, 5, 6];     // the sequence gets longer every round
export const COUNTDOWN_MS = 3000;
export const STEP_MS = 700;           // each tile lights up for this long
export const SHOW_PAD_MS = 800;       // a pause after the last tile before the repeat opens
export const INPUT_MS = 12000;        // time to repeat the sequence
export const NEXT_MS = 2000;
export const AWAY_MS = 20000;

export type Phase = "lobby" | "countdown" | "show" | "input" | "between" | "ended";

export interface Memory {
  seed: number;
  phase: Phase;
  ids: [string | null, string | null];
  nicks: [string, string];
  online: [boolean, boolean];
  seqs: number[][];              // one sequence per round, fixed when the room is made
  round: number;                 // 0 before the first sequence
  progress: [number, number];    // how many tiles each player has repeated correctly
  locked: [boolean, boolean];    // a wrong tap locks a player out of the current round
  score: [number, number];
}

export type Out = EngineOut<Memory>;

/** Same seed, same sequences on every device. The same tile never comes twice in a row. */
export function makeSequences(seed: number): number[][] {
  return LENGTHS.map((len, i) => {
    const r = rng((seed + Math.imul(i + 1, 0x85ebca6b)) >>> 0);
    const seq: number[] = [];
    while (seq.length < len) {
      const tile = Math.floor(r() * TILES);
      if (seq.length && seq[seq.length - 1] === tile) continue;
      seq.push(tile);
    }
    return seq;
  });
}

/** How long the watching lasts: one step per tile, plus a pause. */
export function showMs(len: number): number {
  return len * STEP_MS + SHOW_PAD_MS;
}

export function createMemory(seed: number): Memory {
  return {
    seed,
    phase: "lobby",
    ids: [null, null],
    nicks: ["", ""],
    online: [false, false],
    seqs: makeSequences(seed),
    round: 0,
    progress: [0, 0],
    locked: [false, false],
    score: [0, 0],
  };
}

const out = (room: Memory, events: Ev[] = [], timers: Timer[] = [], error?: string): Out => ({ room, events, timers, error });

export function snapshot(room: Memory) {
  return { phase: room.phase, round: room.round, total: ROUNDS, score: room.score, nicks: room.nicks, online: room.online, progress: room.progress };
}

export function join(room: Memory, userId: string, nick: string): Out {
  const r = seatJoin(room, userId, nick, () => snapshot(room), COUNTDOWN_MS);
  return out(room, r.events, r.timers, r.error);
}

export function leave(room: Memory, slot: Slot): Out {
  room.online[slot] = false;
  const r = seatLeave(room, slot, AWAY_MS);
  return out(room, r.events, r.timers);
}

export function awayTimeout(room: Memory, slot: Slot): Out {
  if (room.phase === "ended" || room.online[slot]) return none(room);
  return finishGame(room, (1 - slot) as Slot, "forfeit");
}

function sequenceMsg(room: Memory, ms: number) {
  return { t: "show", n: room.round, total: ROUNDS, seq: room.seqs[room.round - 1], tiles: TILES, step: STEP_MS, ms };
}

function startRound(room: Memory): Out {
  if (room.round >= ROUNDS) return endGame(room);
  room.round++;
  room.phase = "show";
  room.progress = [0, 0];
  room.locked = [false, false];
  const ms = showMs(room.seqs[room.round - 1].length);
  return out(room, [{ to: "all", msg: sequenceMsg(room, ms) }], [{ kind: "show", ms, round: room.round }]);
}

export function countdownDone(room: Memory): Out {
  if (room.phase !== "countdown") return none(room);
  return startRound(room);
}

/** The watching is over: the repeat opens for both. */
export function showDone(room: Memory, round: number): Out {
  if (room.phase !== "show" || round !== room.round) return none(room);
  room.phase = "input";
  const len = room.seqs[room.round - 1].length;
  return out(
    room,
    [{ to: "all", msg: { t: "input", n: room.round, total: ROUNDS, len, ms: INPUT_MS, progress: room.progress, locked: false } }],
    [{ kind: "round", ms: INPUT_MS, round: room.round }],
  );
}

/** One tap on a tile while the repeat is open. A wrong tile locks that player for the round. */
export function tap(room: Memory, slot: Slot, round: number, tile: number): Out {
  if (room.phase !== "input" || round !== room.round || room.locked[slot]) return none(room);
  if (!Number.isInteger(tile) || tile < 0 || tile >= TILES) return none(room);
  const seq = room.seqs[room.round - 1];
  const mine = room.progress[slot];
  if (tile !== seq[mine]) {
    room.locked[slot] = true;
    const events: Ev[] = [{ to: slot, msg: { t: "lock", n: room.round } }];
    if (room.locked[0] && room.locked[1]) {
      const done = finishRound(room, -1, "miss");
      return out(room, [...events, ...done.events], done.timers);
    }
    return out(room, events);
  }
  room.progress[slot] = mine + 1;
  const events: Ev[] = [{ to: "all", msg: { t: "progress", progress: room.progress } }];
  if (room.progress[slot] === seq.length) {
    const done = finishRound(room, slot, "done");
    return out(room, [...events, ...done.events], done.timers);
  }
  return out(room, events);
}

/** The round is decided: a winner (or -1), the sequence revealed, and a pause before the next one. */
function finishRound(room: Memory, winner: Slot | -1, reason: "done" | "miss" | "time"): { events: Ev[]; timers: Timer[] } {
  room.phase = "between";
  if (winner === 0 || winner === 1) room.score[winner]++;
  return {
    events: [{
      to: "all",
      msg: { t: "result", n: room.round, winner, reason, progress: room.progress, score: room.score, seq: room.seqs[room.round - 1] },
    }],
    timers: [{ kind: "next", ms: NEXT_MS, round: room.round }],
  };
}

/** The repeat ran out of time: whoever got further wins the round, a tie gives nobody the round. */
export function inputTimeout(room: Memory, round: number): Out {
  if (room.phase !== "input" || round !== room.round) return none(room);
  const [a, b] = room.progress;
  const winner = a > b ? 0 : b > a ? 1 : -1;
  const done = finishRound(room, winner as Slot | -1, "time");
  return out(room, done.events, done.timers);
}

export function nextTimeout(room: Memory, round: number): Out {
  if (room.phase !== "between" || round !== room.round) return none(room);
  return startRound(room);
}

function endGame(room: Memory): Out {
  const winner = room.score[0] > room.score[1] ? 0 : room.score[1] > room.score[0] ? 1 : -1;
  return finishGame(room, winner as Slot | -1, "finished");
}

function finishGame(room: Memory, winner: Slot | -1, reason: "finished" | "forfeit"): Out {
  room.phase = "ended";
  return out(room, [{ to: "all", msg: { t: "end", score: room.score, winner, reason } }]);
}

/** A player who comes back: the same watching, or the same repeat with their own progress and lock. */
export function resume(room: Memory, slot: Slot, msLeft: number): Ev[] {
  if (room.phase === "show") return [{ to: slot, msg: sequenceMsg(room, msLeft) }];
  if (room.phase === "input") {
    return [{
      to: slot,
      msg: { t: "input", n: room.round, total: ROUNDS, len: room.seqs[room.round - 1].length, ms: msLeft, progress: room.progress, locked: room.locked[slot] },
    }];
  }
  return [];
}

/** The room host talks to this game through the adapter below (see worker/engine.ts). */
export const memoryEngine: Engine<Memory> = {
  create: createMemory,
  join,
  leave,
  timer: (room, t) => timerEvent(room, t),
  act: (room, slot, msg) =>
    msg.t === "tap" ? tap(room, slot, Number(msg.round), Number(msg.tile)) : none(room),
  inRound: (room) => room.phase === "show" || room.phase === "input",
  resume: (room, slot, msLeft) => resume(room, slot, msLeft),
  ended: (room) => room.phase === "ended",
};

function timerEvent(room: Memory, t: Timer): Out {
  switch (t.kind) {
    case "countdown": return countdownDone(room);
    case "show": return showDone(room, t.round!);
    case "round": return inputTimeout(room, t.round!);
    case "next": return nextTimeout(room, t.round!);
    case "away": return awayTimeout(room, t.slot!);
    default: return none(room);
  }
}
