// Pairing for the one shared queue (see worker/queue.ts). Pure functions: the queue owns the sockets and the clock.
import { MATCHMAKING } from "../config/matchmaking";

export interface Entry {
  userId: string;
  rating: number;
  joinedAt: number;
  offeredBot: boolean;
}

/** How far apart in rating two players may be after waiting `waitMs`: it starts small and widens step by step. */
export function allowedRange(waitMs: number): number {
  const steps = Math.max(0, Math.floor(waitMs / MATCHMAKING.widenStepMs));
  return Math.min(MATCHMAKING.maxRange, MATCHMAKING.baseRange + steps * MATCHMAKING.widenStep);
}

/**
 * Pairs waiting players. The one who has waited longest is matched first, with the closest rating that is inside
 * either player's allowed range. Each player is in at most one pair.
 */
export function findPairs(queue: readonly Entry[], now: number): [Entry, Entry][] {
  const waiting = [...queue].sort((a, b) => a.joinedAt - b.joinedAt || (a.userId < b.userId ? -1 : 1));
  const used = new Set<string>();
  const pairs: [Entry, Entry][] = [];
  for (const e of waiting) {
    if (used.has(e.userId)) continue;
    const range = allowedRange(now - e.joinedAt);
    let best: Entry | null = null;
    let bestDiff = Infinity;
    for (const c of waiting) {
      if (c === e || used.has(c.userId)) continue;
      const diff = Math.abs(c.rating - e.rating);
      const cRange = allowedRange(now - c.joinedAt);
      if (diff <= Math.max(range, cRange) && diff < bestDiff) {
        best = c;
        bestDiff = diff;
      }
    }
    if (best) {
      used.add(e.userId);
      used.add(best.userId);
      pairs.push([e, best]);
    }
  }
  return pairs;
}

/** Players who have waited long enough to be offered a training match with a bot (once each). */
export function botOffers(queue: readonly Entry[], now: number): Entry[] {
  return queue.filter((e) => !e.offeredBot && now - e.joinedAt >= MATCHMAKING.botOfferMs);
}

/** Players whose search has run out of time. */
export function timedOut(queue: readonly Entry[], now: number): Entry[] {
  return queue.filter((e) => now - e.joinedAt >= MATCHMAKING.timeoutMs);
}
