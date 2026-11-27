// Training bots: local algorithmic players, no external API. A bot is always shown as a bot.
// It decides only from what a player sees: the riddle text and options, the watched sequence, the table, the wait
// before the signal. It never reads the right answer; where a discipline needs knowledge a player has to find out,
// the bot guesses among the options and is weaker there.
import { BOT_LEVELS, type BotLevel, type StageGame } from "../config/match";

export interface BotTap { ms: number; msg: Record<string, unknown> }
type Range = readonly [number, number];

const between = (r: () => number, [lo, hi]: Range) => lo + (hi - lo) * r();

/** Shows one matching word per sum: "12 + 7" -> 19; the bot works out what is on screen, like a player would. */
export function solveVisible(text: unknown): number | null {
  const m = /^(\d+) ([+−×]) (\d+)$/.exec(String(text ?? ""));
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[3]);
  return m[2] === "+" ? a + b : m[2] === "−" ? a - b : a * b;
}

/**
 * The taps a bot makes in reply to one message sent to everyone. Returns [] for messages the bot does not act on.
 * `ms` is measured from the moment the message is sent.
 */
export function botPlan(game: StageGame, msg: Record<string, unknown>, level: BotLevel, r: () => number): BotTap[] {
  const cfg = BOT_LEVELS[level];
  const n = Number(msg.n);
  if (game === "reaction" && msg.t === "ready") {
    const wait = Number(msg.ms);
    if (r() < cfg.falseStart) return [{ ms: Math.round(wait * 0.4), msg: { t: "tap", round: n } }];
    return [{ ms: Math.round(wait + between(r, cfg.reactionMs)), msg: { t: "tap", round: n } }];
  }
  if (game === "first" && msg.t === "round") {
    const options = (msg.options as number[]) ?? [];
    const value = solveVisible(msg.text);
    const right = value === null ? -1 : options.indexOf(value);
    let choice = right;
    if (right < 0 || r() > cfg.mathAccuracy) {
      const wrong = options.map((_, i) => i).filter((i) => i !== right);
      choice = wrong[Math.floor(r() * wrong.length)] ?? 0;
    }
    return [{ ms: Math.round(between(r, cfg.mathThinkMs)), msg: { t: "tap", round: n, choice } }];
  }
  if (game === "riddle" && msg.t === "round") {
    const options = (msg.options as string[]) ?? [];
    return [{ ms: Math.round(between(r, cfg.riddleThinkMs)), msg: { t: "tap", round: n, choice: Math.floor(r() * options.length) } }];
  }
  if (game === "grid" && msg.t === "round" && Array.isArray(msg.grid)) {
    const cells = (msg.grid as number[]).length;
    const plan: BotTap[] = [];
    let at = 0;
    for (let v = 1; v <= cells; v++) {
      at += Math.round(between(r, cfg.cellMs));
      plan.push({ ms: at, msg: { t: "tap", round: n, value: v } });
    }
    return plan;
  }
  if (game === "memory" && msg.t === "show" && Array.isArray(msg.seq)) {
    const seq = msg.seq as number[];
    const tiles = Number(msg.tiles) || 9;
    const plan: BotTap[] = [];
    // the repeat opens when the watching ends (msg.ms); the bot starts a moment after that
    let at = Number(msg.ms) + 300;
    for (let k = 0; k < seq.length; k++) {
      at += Math.round(between(r, cfg.tileMs));
      if (r() < cfg.tileError) {
        const wrong = (seq[k] + 1 + Math.floor(r() * (tiles - 1))) % tiles;
        plan.push({ ms: at, msg: { t: "tap", round: n, tile: wrong } });
        break; // a wrong tile locks the bot out of this round
      }
      plan.push({ ms: at, msg: { t: "tap", round: n, tile: seq[k] } });
    }
    return plan;
  }
  return [];
}
