import type { FinishResult } from "./api";

/** Last finished result per experiment, kept for the result, invite and rematch screens. */
export const lastRun: Record<string, FinishResult> = {};
export let latest: FinishResult | null = null;
export function remember(r: FinishResult) { lastRun[r.slug] = r; latest = r; }
