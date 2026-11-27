// "Beyin duellisi": one match of five short disciplines (reaction, memory, math, attention, logic).
// Each discipline is a stage that runs an existing game engine (reaction-core, memory-core, rooms-core, race-core,
// riddle-core) for a few rounds. A stage is won by the player with more rounds; a tie gives nobody the point.
// The player with more stage points wins the match; a tie goes to short sudden-death stages, then a draw.
// Pure game logic: the room host (worker/room.ts) runs the sockets and the clock.
import { BOT_LEVELS, MATCH, type BotLevel, type StageGame, type StageSpec } from "../config/match";
import { rng } from "../shared/rng";
import { createMemory, memoryEngine } from "./memory-core";
import { createReaction, reactionEngine } from "./reaction-core";
import { createRace, raceEngine } from "./race-core";
import { createRiddle, riddleEngine } from "./riddle-core";
import { createRoom, firstEngine } from "./rooms-core";
import { botPlan } from "./bots";
import { none, type Engine, type Ev, type Out as EngineOut, type Slot, type Timer } from "./engine";
import { seatJoin, type Seats } from "./lobby";

export type MatchMode = "rated" | "friendly" | "training";
export interface MatchOpts { code: string; mode: MatchMode; expect: string[] | null; bot?: BotLevel | null }
export interface StageResult { id: string; winner: Slot | -1; score: [number, number] }

export interface Match extends Seats {
  seed: number;
  code: string;
  mode: MatchMode;
  rated: boolean;
  phase: "lobby" | "countdown" | "stage" | "break" | "ended";
  bots: [BotLevel | null, BotLevel | null];
  allowed: string[] | null;
  plan: StageSpec[];
  stage: number;                 // index into plan; -1 before the first stage
  sub: unknown;                  // the engine state of the stage being played
  points: [number, number];
  history: StageResult[];
  suddenDeaths: number;
  winner: Slot | -1 | null;
  reason: string | null;
  tick: number;                  // counts bot decisions, so bot randomness is repeatable for a seed
}

export type Out = EngineOut<Match>;

interface SubGame { engine: Engine<unknown>; create: (seed: number, rounds: number) => unknown }
const SUB: Record<StageGame, SubGame> = {
  first: { engine: firstEngine as unknown as Engine<unknown>, create: (s, n) => createRoom(s, n) },
  grid: { engine: raceEngine as unknown as Engine<unknown>, create: (s, n) => createRace(s, n) },
  memory: { engine: memoryEngine as unknown as Engine<unknown>, create: (s, n) => createMemory(s, n) },
  reaction: { engine: reactionEngine as unknown as Engine<unknown>, create: (s, n) => createReaction(s, n) },
  riddle: { engine: riddleEngine as unknown as Engine<unknown>, create: (s, n) => createRiddle(s, n) },
};

export function createMatch(seed: number, opts: MatchOpts): Match {
  const bot = opts.bot ?? null;
  const room: Match = {
    seed,
    code: opts.code,
    mode: opts.mode,
    rated: opts.mode === "rated" && bot === null,
    phase: "lobby",
    ids: [null, null],
    nicks: ["", ""],
    online: [false, false],
    bots: [null, bot],
    allowed: opts.expect,
    plan: MATCH.stages.map((s) => ({ ...s })),
    stage: -1,
    sub: null,
    points: [0, 0],
    history: [],
    suddenDeaths: 0,
    winner: null,
    reason: null,
    tick: 0,
  };
  if (bot) {
    // a bot sits in seat 1 from the start; it is always shown as a bot
    room.ids[1] = `bot:${bot}:${seed}`;
    room.nicks[1] = `BOT · ${BOT_LEVELS[bot].name}`;
    room.online[1] = true;
  }
  return room;
}

const out = (room: Match, events: Ev[] = [], timers: Timer[] = [], error?: string, result?: unknown): Out => ({ room, events, timers, error, result });
const err = (room: Match, code: string): Out => out(room, [], [], code);

export function snapshot(room: Match) {
  return {
    phase: room.phase,
    stage: room.stage,
    sid: room.plan[room.stage]?.id ?? null,
    plan: room.plan.map((s) => s.id),
    points: room.points,
    nicks: room.nicks,
    online: room.online,
    bots: room.bots,
    mode: room.mode,
  };
}

export function join(room: Match, userId: string, nick: string): Out {
  if (room.allowed && !room.allowed.includes(userId)) return err(room, "not_invited");
  if (room.phase === "ended") return err(room, "ended");
  const r = seatJoin(room, userId, nick, () => snapshot(room), 0);
  if (r.error) return err(room, r.error);
  // the lobby countdown is replaced by the countdown of the first stage, so the lobby's own is dropped
  const events = r.events.filter((e) => e.msg.t !== "countdown");
  if (room.phase === "countdown") {
    room.phase = "lobby";
    return startStage(room, 0, events);
  }
  // a player who comes back mid-match gets their seat and the opponent's status (seatJoin); the stage resume comes from the host
  return out(room, events, []);
}

/** A player left: in the lobby the seat is freed; in a match the other side waits for the away window. */
export function leave(room: Match, slot: Slot): Out {
  if (room.phase === "ended") return none(room);
  room.online[slot] = false;
  if (room.phase === "lobby") {
    room.ids[slot] = null;
    room.nicks[slot] = "";
    return none(room);
  }
  const other = (1 - slot) as Slot;
  return out(room, [{ to: other, msg: { t: "opponent", state: "away", ms: MATCH.awayMs } }], [{ kind: "away", ms: MATCH.awayMs, slot }]);
}

function startStage(room: Match, idx: number, pre: Ev[] = []): Out {
  room.stage = idx;
  room.phase = "stage";
  const spec = room.plan[idx];
  const def = SUB[spec.game];
  // one seed per stage, the same for both players: equal conditions
  const seed = (room.seed + Math.imul(idx + 1, 0x9e3779b1)) >>> 0;
  room.sub = def.create(seed, spec.rounds);
  const events: Ev[] = [...pre];
  const timers: Timer[] = [];
  for (const slot of [0, 1] as Slot[]) {
    const id = room.ids[slot];
    if (!id) continue;
    const sub = def.engine.join(room.sub, id, room.nicks[slot]);
    const part = absorb(room, idx, sub, ["welcome", "opponent"]);
    events.push(...part.events);
    timers.push(...part.timers);
  }
  return out(room, events, timers);
}

/**
 * Takes what a stage's engine produced: tags every message with the stage, plans the bot's taps, and turns the
 * end of the stage into a stage result. Messages addressed to one seat keep their target.
 */
function absorb(room: Match, idx: number, sub: EngineOut<unknown>, skip: string[] = []): { events: Ev[]; timers: Timer[] } {
  room.sub = sub.room;
  const spec = room.plan[idx];
  const events: Ev[] = [];
  const timers: Timer[] = sub.timers.map((t) => ({ ...t, stage: idx }));
  let ended: Ev | null = null;
  for (const e of sub.events) {
    const t = String(e.msg.t);
    if (skip.includes(t)) continue;
    if (t === "end") {
      ended = e;
      continue;
    }
    events.push({ to: e.to, msg: { ...e.msg, stage: idx, sid: spec.id } });
    if (e.to === "all") timers.push(...botTimers(room, idx, e.msg));
  }
  if (ended) {
    const winner = Number(ended.msg.winner) as Slot | -1;
    const score = (ended.msg.score as number[]).slice(0, 2) as [number, number];
    room.history.push({ id: spec.id, winner, score: [score[0], score[1]] });
    if (winner === 0 || winner === 1) room.points[winner]++;
    room.phase = "break";
    events.push({ to: "all", msg: { t: "stage_end", stage: idx, sid: spec.id, winner, score, points: [...room.points] } });
    timers.push({ kind: "stage", ms: MATCH.breakMs, stage: idx });
  }
  return { events, timers };
}

/** The bot's taps for a message everyone got. Only the bot's seat (1) is planned here. */
function botTimers(room: Match, idx: number, msg: Record<string, unknown>): Timer[] {
  const level = room.bots[1];
  if (!level) return [];
  const r = rng((room.seed ^ Math.imul(++room.tick, 0x85ebca6b)) >>> 0);
  return botPlan(room.plan[idx].game, msg, level, r).map((tap) => ({ kind: "bot", ms: tap.ms, stage: idx, msg: tap.msg, slot: 1 as Slot }));
}

/** A move from a seated player inside the current stage (taps). A move tagged with another stage is stale. */
export function act(room: Match, slot: Slot, msg: Record<string, unknown>, now: number): Out {
  if (room.phase !== "stage") return none(room);
  if (msg.stage !== undefined && Number(msg.stage) !== room.stage) return none(room);
  const def = SUB[room.plan[room.stage].game];
  const sub = def.engine.act(room.sub, slot, msg, now);
  const part = absorb(room, room.stage, sub);
  return out(room, part.events, part.timers);
}

export function timer(room: Match, t: Timer, now: number): Out {
  switch (t.kind) {
    case "lobby":
      return room.phase === "lobby" ? finish(room, -1, "no_show") : none(room);
    case "away":
      return awayTimeout(room, t.slot!);
    case "stage":
      return room.phase === "break" && t.stage === room.stage ? nextStage(room) : none(room);
    case "bot":
      if (room.phase !== "stage" || t.stage !== room.stage) return none(room);
      return act(room, 1, t.msg!, now);
    default: {
      // timers of the stage's own engine: countdown, show, go, round, next
      if (room.phase !== "stage" || t.stage !== room.stage) return none(room);
      const def = SUB[room.plan[room.stage].game];
      const sub = def.engine.timer(room.sub, t, now);
      const part = absorb(room, room.stage, sub);
      return out(room, part.events, part.timers);
    }
  }
}

/** The away window ran out: the player who did not come back loses the match by forfeit. */
export function awayTimeout(room: Match, slot: Slot): Out {
  if (room.phase === "ended" || room.online[slot]) return none(room);
  return finish(room, (1 - slot) as Slot, "forfeit");
}

function nextStage(room: Match): Out {
  const idx = room.stage + 1;
  if (idx < room.plan.length) return startStage(room, idx);
  if (room.points[0] !== room.points[1]) return finish(room, room.points[0] > room.points[1] ? 0 : 1, "finished");
  if (room.suddenDeaths < MATCH.maxSuddenDeaths) {
    room.suddenDeaths++;
    room.plan.push({ ...MATCH.sudden });
    return startStage(room, room.plan.length - 1);
  }
  return finish(room, -1, "finished");
}

function finish(room: Match, winner: Slot | -1, reason: "finished" | "forfeit" | "no_show"): Out {
  room.phase = "ended";
  room.winner = winner;
  room.reason = reason;
  const humans = room.ids.every((id, s) => id !== null && room.bots[s] === null);
  // the result is handed to the host once; the host stores it and updates ratings and rewards (see worker/match-store.ts)
  const result = reason === "no_show"
    ? undefined
    : {
        code: room.code,
        mode: room.mode,
        rated: room.rated && humans,
        ids: [room.ids[0], room.ids[1]] as [string | null, string | null],
        bots: [room.bots[0], room.bots[1]] as [BotLevel | null, BotLevel | null],
        points: [room.points[0], room.points[1]] as [number, number],
        winner,
        reason,
        history: room.history.map((h) => ({ ...h, score: [...h.score] as [number, number] })),
      };
  return out(room, [{ to: "all", msg: { t: "end", winner, reason, points: [...room.points], history: room.history } }], [], undefined, result);
}

export function inRound(room: Match): boolean {
  return room.phase === "stage" && SUB[room.plan[room.stage].game].engine.inRound(room.sub);
}

/** A player who comes back mid-round: the stage's own resume, with the stage tag. */
export function resume(room: Match, slot: Slot, msLeft: number): Ev[] {
  if (room.phase !== "stage") return [];
  const spec = room.plan[room.stage];
  return SUB[spec.game].engine.resume(room.sub, slot, msLeft).map((e) => ({ to: e.to, msg: { ...e.msg, stage: room.stage, sid: spec.id } }));
}

export const duel5Engine: Engine<Match> = {
  create: (seed) => createMatch(seed, { code: "", mode: "friendly", expect: null }),
  setup: (seed, opts) => createMatch(seed, opts as unknown as MatchOpts),
  join,
  leave,
  timer,
  act,
  inRound,
  resume,
  ended: (room) => room.phase === "ended",
};
