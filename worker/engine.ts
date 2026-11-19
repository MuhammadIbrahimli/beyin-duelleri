// What a live game provides to the shared room host (worker/room.ts). Each game is a pure state machine:
// it returns the messages to send and the timers to start; the host does the sockets and the clock.
export type Slot = 0 | 1;
export type Ev = { to: Slot | "all"; msg: Record<string, unknown> };
export type Timer = { kind: "countdown" | "round" | "next" | "away"; ms: number; round?: number; slot?: Slot };
export interface Out<R> { room: R; events: Ev[]; timers: Timer[]; error?: string }

export const none = <R>(room: R): Out<R> => ({ room, events: [], timers: [] });

export interface Engine<R> {
  create(seed: number): R;
  join(room: R, userId: string, nick: string): Out<R>;
  leave(room: R, slot: Slot): Out<R>;
  awayTimeout(room: R, slot: Slot): Out<R>;
  countdownDone(room: R, now: number): Out<R>;
  /** A message from a seated player during the game (taps). Unknown messages change nothing. */
  act(room: R, slot: Slot, msg: Record<string, unknown>, now: number): Out<R>;
  roundTimeout(room: R, round: number, now: number): Out<R>;
  nextTimeout(room: R, round: number, now: number): Out<R>;
  inRound(room: R): boolean;
  /** What a player who comes back mid-round needs: the current round, with the time left. */
  resume(room: R, slot: Slot, msLeft: number): Ev[];
  ended(room: R): boolean;
}
