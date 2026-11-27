import { describe, expect, it } from "vitest";
import { BOT_LEVELS } from "../config/match";
import { botPlan, solveVisible } from "../worker/bots";

// a random source that always gives the same number: 0 = always "succeeds" below the threshold, 0.99 = always fails
const fixed = (x: number) => () => x;

describe("bots see only what a player sees", () => {
  it("solves a sum from the visible text", () => {
    expect(solveVisible("12 + 7")).toBe(19);
    expect(solveVisible("30 − 11")).toBe(19);
    expect(solveVisible("6 × 13")).toBe(78);
    expect(solveVisible("what is this")).toBeNull();
  });

  it("a math bot with full accuracy taps the option that the visible sum gives", () => {
    const msg = { t: "round", n: 2, text: "6 × 13", options: [70, 78, 80, 88] };
    const [tap] = botPlan("first", msg, "ekspert", fixed(0));
    expect(tap.msg).toEqual({ t: "tap", round: 2, choice: 1 });
    expect(tap.ms).toBeGreaterThan(0);
  });

  it("a math bot that misses picks a wrong option", () => {
    const msg = { t: "round", n: 1, text: "6 × 13", options: [70, 78, 80, 88] };
    const [tap] = botPlan("first", msg, "asan", fixed(0.99));
    expect(tap.msg.choice).not.toBe(1);
  });

  it("riddles give no access to the answer: the bot picks at random among the options", () => {
    const msg = { t: "round", n: 1, text: "riddle", options: ["a", "b", "c", "d"] };
    const [tap] = botPlan("riddle", msg, "ekspert", fixed(0.99));
    expect(tap.msg.choice).toBe(3);
    expect(tap.ms).toBeGreaterThanOrEqual(BOT_LEVELS.ekspert.riddleThinkMs[0]);
  });

  it("the grid bot taps 1, 2, 3 … in order, one number after another", () => {
    const grid = Array.from({ length: 25 }, (_, i) => i + 1);
    const plan = botPlan("grid", { t: "round", n: 1, grid }, "cetin", fixed(0.5));
    expect(plan.map((p) => p.msg.value)).toEqual(grid);
    for (let i = 1; i < plan.length; i++) expect(plan[i].ms).toBeGreaterThan(plan[i - 1].ms);
  });

  it("the memory bot repeats the sequence it watched, tile by tile", () => {
    const seq = [4, 1, 7, 2];
    const plan = botPlan("memory", { t: "show", n: 1, seq, tiles: 9, ms: 4000 }, "ekspert", fixed(0.5));
    expect(plan.map((p) => p.msg.tile)).toEqual(seq);
    expect(plan[0].ms).toBeGreaterThan(4000);
  });

  it("a memory bot that errs locks itself out after the wrong tile", () => {
    const seq = [4, 1, 7, 2];
    const plan = botPlan("memory", { t: "show", n: 1, seq, tiles: 9, ms: 4000 }, "asan", fixed(0.0));
    expect(plan).toHaveLength(1);
    expect(plan[0].msg.tile).not.toBe(4);
  });

  it("a reaction bot taps after the signal, with a human-like delay", () => {
    const [tap] = botPlan("reaction", { t: "ready", n: 1, ms: 2000 }, "orta", fixed(0.5));
    expect(tap.ms).toBeGreaterThanOrEqual(2000 + BOT_LEVELS.orta.reactionMs[0]);
    expect(tap.ms).toBeLessThanOrEqual(2000 + BOT_LEVELS.orta.reactionMs[1]);
  });

  it("an Asan bot sometimes taps before the signal (a false start), an Ekspert never does", () => {
    const early = botPlan("reaction", { t: "ready", n: 1, ms: 2000 }, "asan", fixed(0));
    expect(early[0].ms).toBeLessThan(2000);
    const never = botPlan("reaction", { t: "ready", n: 1, ms: 2000 }, "ekspert", fixed(0));
    expect(never[0].ms).toBeGreaterThanOrEqual(2000);
  });

  it("messages a bot does not act on give no taps", () => {
    expect(botPlan("reaction", { t: "go", n: 1, ms: 3000 }, "ekspert", fixed(0.5))).toEqual([]);
    expect(botPlan("riddle", { t: "result", n: 1 }, "ekspert", fixed(0.5))).toEqual([]);
  });

  it("levels get stronger in order, by their speed in the math discipline", () => {
    const order = ["asan", "orta", "cetin", "ekspert"] as const;
    for (let i = 1; i < order.length; i++) {
      expect(BOT_LEVELS[order[i]].mathThinkMs[1]).toBeLessThanOrEqual(BOT_LEVELS[order[i - 1]].mathThinkMs[1]);
      expect(BOT_LEVELS[order[i]].mathAccuracy).toBeGreaterThanOrEqual(BOT_LEVELS[order[i - 1]].mathAccuracy);
    }
  });
});
