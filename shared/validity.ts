export const MIN_HUMAN_REACTION_MS = 100;
export const MAX_RUNS_PER_MINUTE = 4;

export const hasImpossibleReaction = (times: number[]) => times.some((t) => t < MIN_HUMAN_REACTION_MS);
export const hasIdenticalTimes = (times: number[]) => times.length > 1 && times.every((t) => t === times[0]);
/** Run finished faster than the schedule allows: client skipped waiting. */
export const finishedTooFast = (elapsedMs: number, minMs: number) => elapsedMs < minMs;
export const tooManyRecentRuns = (recentCount: number) => recentCount >= MAX_RUNS_PER_MINUTE;
