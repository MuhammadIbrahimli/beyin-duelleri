// "Beyin duellisi": one match of five short disciplines. Every number that tunes the match lives here.
// Stage order is fixed, so both players get the same disciplines with the same seeds (see worker/duel5-core.ts).
// Each stage is a short version of an existing game: `game` names the engine, `rounds` how many rounds it plays.
// Rough length with human players: ~90-150 s in total (countdown 3 s and a 2.5 s break per stage included).
export type StageGame = "reaction" | "memory" | "first" | "grid" | "riddle";

export interface StageSpec {
  id: "reaction" | "memory" | "math" | "attention" | "logic" | "sudden";
  game: StageGame;
  rounds: number;
}

export const MATCH = {
  stages: [
    { id: "reaction", game: "reaction", rounds: 3 },
    { id: "memory", game: "memory", rounds: 2 },
    { id: "math", game: "first", rounds: 4 },
    { id: "attention", game: "grid", rounds: 1 },
    { id: "logic", game: "riddle", rounds: 2 },
  ] as StageSpec[],
  /** After a tie on points: a one-round reaction duel, up to this many times. Then the match is a draw. */
  sudden: { id: "sudden", game: "reaction", rounds: 1 } as StageSpec,
  maxSuddenDeaths: 2,
  /** Pause between two stages, to show the result and the next discipline. */
  breakMs: 2500,
  /** A room where the second player never shows up is closed after this (nothing is recorded). */
  lobbyMs: 30000,
  /** A player who lost the connection has this long to come back; then the match is lost by forfeit. */
  awayMs: 20000,
};

/** Bot skill levels. Bots decide only from what a player sees: the visible text, options, sequence and table. */
export const BOT_LEVELS = {
  asan: { name: "Asan", reactionMs: [520, 780], falseStart: 0.1, mathThinkMs: [4200, 6500], mathAccuracy: 0.7, tileMs: [900, 1200], tileError: 0.2, cellMs: [1100, 1500], riddleThinkMs: [6000, 11000] },
  orta: { name: "Orta", reactionMs: [360, 520], falseStart: 0.05, mathThinkMs: [3000, 5000], mathAccuracy: 0.82, tileMs: [700, 950], tileError: 0.12, cellMs: [800, 1100], riddleThinkMs: [4500, 9000] },
  cetin: { name: "Çətin", reactionMs: [260, 380], falseStart: 0.02, mathThinkMs: [2000, 3500], mathAccuracy: 0.92, tileMs: [520, 700], tileError: 0.06, cellMs: [550, 800], riddleThinkMs: [3000, 7000] },
  ekspert: { name: "Ekspert", reactionMs: [200, 270], falseStart: 0, mathThinkMs: [1200, 2400], mathAccuracy: 0.98, tileMs: [380, 500], tileError: 0.02, cellMs: [330, 450], riddleThinkMs: [2000, 5000] },
} as const;
export type BotLevel = keyof typeof BOT_LEVELS;
export const BOT_LEVEL_IDS = Object.keys(BOT_LEVELS) as BotLevel[];
