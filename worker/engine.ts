// What a live game provides to the shared room host (worker/room.ts). Each game is a pure state machine:
// it returns the messages to send and the timers to start; the host does the sockets and the clock.
export type Slot = 0 | 1;
export type Ev = { to: Slot | "all"; msg: Record<string, unknown> };
export type TimerKind = "countdown" | "show" | "go" | "round" | "next" | "away" | "lobby" | "stage" | "bot";
/** `stage` tags a timer with the stage of a multi-discipline match it belongs to (see worker/duel5-core.ts). */
export type Timer = { kind: TimerKind; ms: number; round?: number; slot?: Slot; stage?: number; msg?: Record<string, unknown> };
/** `result` is set once, when a match is over: the host stores it (see worker/match-store.ts). */
export interface Out<R> { room: R; events: Ev[]; timers: Timer[]; error?: string; result?: unknown }

export const none = <R>(room: R): Out<R> => ({ room, events: [], timers: [] });

export const GAME_IDS = ["first", "grid", "memory", "reaction", "riddle", "multi"] as const;
export type GameId = (typeof GAME_IDS)[number];

/** Messages that start a timed phase. The host remembers when it ends, so a player who comes back can be told the time left. */
export const TIMED_MESSAGES = new Set(["round", "show", "input", "ready", "go"]);

export interface Engine<R> {
  create(seed: number): R;
  /** Games that take options when the room is made (the multi-discipline match: seats, bots, match code). */
  setup?(seed: number, opts: Record<string, unknown>): R;
  join(room: R, userId: string, nick: string): Out<R>;
  leave(room: R, slot: Slot): Out<R>;
  /** One of the timers the game set earlier has run out. */
  timer(room: R, t: Timer, now: number): Out<R>;
  /** A message from a seated player during the game (taps). Unknown messages change nothing. */
  act(room: R, slot: Slot, msg: Record<string, unknown>, now: number): Out<R>;
  inRound(room: R): boolean;
  /** What a player who comes back mid-round needs: the current phase, with the time left. */
  resume(room: R, slot: Slot, msLeft: number): Ev[];
  ended(room: R): boolean;
}
