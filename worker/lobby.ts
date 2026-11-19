// Seats shared by every live game: joining, the countdown that starts when both are seated, and leaving.
import type { Ev, Slot, Timer } from "./engine";

export interface Seats {
  phase: string;
  ids: [string | null, string | null];
  nicks: [string, string];
  online: [boolean, boolean];
}
export interface SeatOut { events: Ev[]; timers: Timer[]; error?: string }

/** A returning player gets their old seat back, even mid-game. A new player takes a free seat, in the lobby only. */
export function seatJoin(room: Seats, userId: string, nick: string, snapshot: () => object, countdownMs: number): SeatOut {
  const mine = room.ids.indexOf(userId);
  if (mine >= 0) {
    const slot = mine as Slot;
    room.online[slot] = true;
    return {
      events: [
        { to: slot, msg: { t: "welcome", slot, state: snapshot() } },
        { to: (1 - slot) as Slot, msg: { t: "opponent", state: "back" } },
      ],
      timers: [],
    };
  }
  const free = room.ids.indexOf(null);
  if (free < 0 || room.phase !== "lobby") return { events: [], timers: [], error: "full" };
  const slot = free as Slot;
  room.ids[slot] = userId;
  room.nicks[slot] = nick;
  room.online[slot] = true;
  const events: Ev[] = [{ to: slot, msg: { t: "welcome", slot, state: snapshot() } }];
  const other = (1 - slot) as Slot;
  if (room.ids[other]) {
    events.push({ to: other, msg: { t: "opponent", state: "joined", nick } });
    events.push({ to: slot, msg: { t: "opponent", state: "joined", nick: room.nicks[other] } });
  }
  if (room.ids[0] && room.ids[1]) {
    room.phase = "countdown";
    events.push({ to: "all", msg: { t: "countdown", ms: countdownMs } });
    return { events, timers: [{ kind: "countdown", ms: countdownMs }] };
  }
  return { events, timers: [] };
}

/** In the lobby the seat is freed; in a game the other side waits for the window to close. */
export function seatLeave(room: Seats, slot: Slot, awayMs: number): SeatOut {
  room.online[slot] = false;
  if (room.phase === "lobby") {
    room.ids[slot] = null;
    room.nicks[slot] = "";
    return { events: [], timers: [] };
  }
  if (room.phase === "ended") return { events: [], timers: [] };
  const other = (1 - slot) as Slot;
  return {
    events: [{ to: other, msg: { t: "opponent", state: "away", ms: awayMs } }],
    timers: [{ kind: "away", ms: awayMs, slot }],
  };
}
