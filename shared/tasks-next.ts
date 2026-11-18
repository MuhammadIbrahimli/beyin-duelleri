// Tower of Hanoi (Simon, 1975, planning): move all disks to the last peg; fewer extra moves is better.
// Starter values for the penalty and the level thresholds (TODO(verify)), see config/points.ts and config/levels.ts.
import type { Scorer } from "./scoring";

// ---- Tower of Hanoi --------------------------------------------------------------------------------
export const HANOI_SIZES = [3, 4];          // two puzzles: 3 disks (7 moves) and 4 disks (15 moves)
export const HANOI_MAX_MOVES = 80;          // per puzzle; running out counts as unsolved
const HANOI_UNSOLVED_PENALTY = 20;          // extra moves charged for an unsolved puzzle
export interface HanoiSchedule { sizes: number[] }
export type Move = [number, number];

/** Replays the moves on the peg model. Returns null for an illegal move (the client never sends one). */
export function replayHanoi(n: number, moves: Move[]): { solved: boolean } | null {
  const pegs: number[][] = [Array.from({ length: n }, (_, i) => n - i), [], []]; // top of a peg = last element
  for (const [from, to] of moves) {
    if (![0, 1, 2].includes(from) || ![0, 1, 2].includes(to) || from === to) return null;
    const disk = pegs[from].pop();
    if (disk === undefined) return null;
    const top = pegs[to][pegs[to].length - 1];
    if (top !== undefined && top < disk) return null;
    pegs[to].push(disk);
  }
  return { solved: pegs[2].length === n };
}

export const hanoi: Scorer<HanoiSchedule> = {
  schedule: () => ({ sizes: HANOI_SIZES }),
  minDurationMs: () => 4000,
  score(s, payload) {
    const p = payload as { puzzles?: unknown };
    if (!Array.isArray(p?.puzzles) || p.puzzles.length !== s.sizes.length) return null;
    let extra = 0, solvedCount = 0, totalMoves = 0;
    for (let i = 0; i < s.sizes.length; i++) {
      const moves = p.puzzles[i] as Move[];
      if (!Array.isArray(moves) || moves.length > HANOI_MAX_MOVES) return null;
      const res = replayHanoi(s.sizes[i], moves);
      if (!res) return null;
      const optimal = 2 ** s.sizes[i] - 1;
      totalMoves += moves.length;
      if (res.solved) { solvedCount++; extra += moves.length - optimal; }
      else extra += HANOI_UNSOLVED_PENALTY;
    }
    return {
      primary: extra, // extra moves beyond the optimum (plus a penalty per unsolved puzzle); lower is better
      secondary: { solved: solvedCount, moves: totalMoves },
      valid: true,
    };
  },
};

export const SCORERS_NEXT: Record<string, Scorer<any>> = {
  hanoi,
};
