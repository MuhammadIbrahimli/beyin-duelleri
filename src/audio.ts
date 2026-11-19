// One audio context for the whole app, and a list of every sound that is scheduled.
// Leaving a game stops everything that is still scheduled, so no sound plays on the menu.
let ctx: AudioContext | null = null;
const live = new Set<AudioScheduledSourceNode>();

export function audioCtx(): AudioContext {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Remember a started source so that it can be stopped when the player leaves the game. */
export function track(node: AudioScheduledSourceNode) {
  live.add(node);
  node.onended = () => live.delete(node);
}

export function stopAll() {
  for (const n of live) { try { n.stop(); } catch { /* already ended */ } }
  live.clear();
}

/** True only while a game screen is on the page: menus and results are silent. */
export const inExperiment = () => !!document.querySelector("#app .screen.full");
