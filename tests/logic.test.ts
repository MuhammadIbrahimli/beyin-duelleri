import { describe, expect, it } from "vitest";
import { compareRuns, rankRuns, type DuelRun } from "../shared/duel";
import { bySlug, dailySlug } from "../shared/experiments";
import { levelFor } from "../shared/levels";
import { hashString, rng } from "../shared/rng";
import { refleks } from "../shared/scoring";
import { buildCityStats, median, percentileBeaten } from "../shared/stats";
import { hasIdenticalTimes, hasImpossibleReaction, tooManyRecentRuns } from "../shared/validity";
import { streakOf } from "../worker/routes/misc";

const run = (primary: number, secondary: Record<string, number> = {}, valid = true): DuelRun => ({
  valid, primary, secondary, finishedAt: 0,
});

describe("seed determinism", () => {
  it("same seed gives same sequence, different seed differs", () => {
    const a = rng(42), b = rng(42), c = rng(43);
    const sa = [a(), a(), a()], sb = [b(), b(), b()], sc = [c(), c(), c()];
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
  });
  it("refleks schedule is deterministic and within 1.5-4.5 s", () => {
    expect(refleks.schedule(7)).toEqual(refleks.schedule(7));
    for (const d of refleks.schedule(123).delays) {
      expect(d).toBeGreaterThanOrEqual(1500);
      expect(d).toBeLessThanOrEqual(4500);
    }
    expect(refleks.schedule(1)).not.toEqual(refleks.schedule(2));
  });
  it("daily seed depends only on date and experiment", () => {
    expect(hashString("2026-11-18:refleks")).toBe(hashString("2026-11-18:refleks"));
    expect(hashString("2026-11-18:refleks")).not.toBe(hashString("2026-11-19:refleks"));
    expect(dailySlug("2026-11-16")).toBe("refleks"); // Monday
    expect(dailySlug("2026-11-20")).toBe("eyni-rengdir"); // Friday
  });
});

describe("refleks scoring", () => {
  const s = refleks.schedule(1);
  it("takes the median and counts early taps", () => {
    const r = refleks.score(s, { times: [300, 250, 280, 400, 260], earlyTaps: 1 })!;
    expect(r.primary).toBe(280);
    expect(r.secondary.earlyTaps).toBe(1);
    expect(r.valid).toBe(true);
  });
  it("flags < 100 ms and identical times as invalid", () => {
    expect(refleks.score(s, { times: [300, 90, 280, 400, 260] })!.valid).toBe(false);
    expect(refleks.score(s, { times: [250, 250, 250, 250, 250] })!.valid).toBe(false);
    expect(hasImpossibleReaction([99])).toBe(true);
    expect(hasImpossibleReaction([100])).toBe(false);
    expect(hasIdenticalTimes([200])).toBe(false);
  });
  it("rejects malformed payloads", () => {
    expect(refleks.score(s, { times: [1, 2] })).toBeNull();
    expect(refleks.score(s, { times: [300, 300, 300, 300, "x"] })).toBeNull();
    expect(refleks.score(s, { times: [300, 310, 320, 330, 340], earlyTaps: 9 })).toBeNull();
    expect(refleks.score(s, null)).toBeNull();
  });
  it("rapid-series rule", () => {
    expect(tooManyRecentRuns(3)).toBe(false);
    expect(tooManyRecentRuns(4)).toBe(true);
  });
});

describe("levels", () => {
  it("refleks boundaries", () => {
    expect([200, 229, 230, 279, 280, 349, 350, 400].map((v) => levelFor("refleks", v))).toEqual([4, 4, 3, 3, 2, 2, 1, 1]);
  });
  it("memory chain (higher is better)", () => {
    expect([3, 4, 5, 6, 7, 8, 12].map((v) => levelFor("yaddas-zenciri", v))).toEqual([1, 1, 2, 3, 3, 4, 4]);
  });
  it("illusions: 0 errors is the best", () => {
    expect([3, 2, 1, 0].map((v) => levelFor("eyni-rengdir", v))).toEqual([1, 2, 3, 4]);
  });
  it("lovber has no levels", () => expect(levelFor("lovber", 100)).toBeNull());
});

describe("duel winner", () => {
  const refl = bySlug("refleks")!;
  it("lower reaction time wins", () => {
    expect(compareRuns(refl, run(240), run(260))).toBe(1);
    expect(compareRuns(refl, run(280), run(260))).toBe(-1);
  });
  it("tie broken by fewer early taps, else a draw", () => {
    expect(compareRuns(refl, run(250, { earlyTaps: 0 }), run(250, { earlyTaps: 2 }))).toBe(1);
    expect(compareRuns(refl, run(250, { earlyTaps: 1 }), run(250, { earlyTaps: 1 }))).toBe(0);
  });
  it("higher is better for memory; total time breaks ties", () => {
    const m = bySlug("yaddas-zenciri")!;
    expect(compareRuns(m, run(7, { totalMs: 9000 }), run(6, { totalMs: 5000 }))).toBe(1);
    expect(compareRuns(m, run(6, { totalMs: 5000 }), run(6, { totalMs: 9000 }))).toBe(1);
  });
  it("a valid run beats an invalid one", () => {
    expect(compareRuns(refl, run(300), run(100, {}, false))).toBe(1);
  });
  it("group ranks share places on ties", () => {
    expect(rankRuns(refl, [run(300), run(250), run(250), run(400)])).toEqual([3, 1, 1, 4]);
  });
});

describe("city ranking threshold", () => {
  const rows = (city: string | null, n: number, score = 250) => Array.from({ length: n }, () => ({ city, score }));
  it("shows a city only with at least 30 participants; the rest fold into diger", () => {
    const stats = buildCityStats([...rows("baki", 30, 240), ...rows("gence", 29, 300), ...rows("seki", 5, 500)]);
    const by = Object.fromEntries(stats.map((s) => [s.city, s]));
    expect(by.baki.n).toBe(30);
    expect(by.gence).toBeUndefined();
    expect(by.seki).toBeUndefined();
    expect(by.diger.n).toBe(34);
  });
  it("uses the median, not the mean", () => {
    expect(median([1, 2, 1000])).toBe(2);
    const stats = buildCityStats([...rows("baki", 29, 200), { city: "baki", score: 99999 }]);
    expect(stats[0].median).toBe(200);
  });
});

describe("percentile", () => {
  const pts = Array.from({ length: 200 }, (_, i) => 150 + i);
  it("is null below 200 runs", () => expect(percentileBeaten(pts, 199, 200, "lower")).toBeNull());
  it("share of participants beaten", () => {
    expect(percentileBeaten(pts, 500, 150, "lower")).toBeGreaterThanOrEqual(99);
    expect(percentileBeaten(pts, 500, 400, "lower")).toBe(0);
    expect(percentileBeaten(pts, 500, 349, "higher")).toBe(100);
  });
});

describe("streak", () => {
  it("counts consecutive days, still alive if today is not done yet", () => {
    expect(streakOf(["2026-11-18", "2026-11-17", "2026-11-16"], "2026-11-18")).toBe(3);
    expect(streakOf(["2026-11-17", "2026-11-16"], "2026-11-18")).toBe(2);
    expect(streakOf(["2026-11-15"], "2026-11-18")).toBe(0);
    expect(streakOf(["2026-11-18", "2026-11-16"], "2026-11-18")).toBe(1);
  });
});

import { rengVeSoz } from "../shared/scoring";

describe("reng-ve-soz scoring", () => {
  const s = rengVeSoz.schedule(5);
  const perfect = (ms: (i: number) => number) => ({
    answers: s.trials.map((t) => t.ink),
    times: s.trials.map((_, i) => ms(i)),
  });
  it("schedule: 12 congruent + 12 conflicting, deterministic", () => {
    expect(s.trials).toHaveLength(24);
    expect(s.trials.filter((t) => t.congruent)).toHaveLength(12);
    expect(s.trials.filter((t) => !t.congruent).every((t) => t.word !== t.ink)).toBe(true);
    expect(rengVeSoz.schedule(5)).toEqual(s);
    expect(rengVeSoz.schedule(6)).not.toEqual(s);
  });
  it("focus score = mean of correct conflicting times; interference = conflicting - congruent", () => {
    const r = rengVeSoz.score(s, perfect((i) => (s.trials[i].congruent ? 500 : 620 + (i % 2))))!;
    expect(r.valid).toBe(true);
    expect(r.secondary.errors).toBe(0);
    expect(r.primary).toBeGreaterThanOrEqual(620);
    expect(r.primary).toBeLessThanOrEqual(621);
    expect(r.secondary.interference).toBeGreaterThanOrEqual(120);
  });
  it("each error adds 300 ms", () => {
    const base = perfect((i) => (s.trials[i].congruent ? 500 : 600 + i));
    const clean = rengVeSoz.score(s, base)!;
    const wrongIdx = s.trials.findIndex((t) => t.congruent); // error on a congruent trial leaves the mean intact
    const answers = base.answers.slice();
    answers[wrongIdx] = (answers[wrongIdx] + 1) % 4;
    const r = rengVeSoz.score(s, { ...base, answers })!;
    expect(r.secondary.errors).toBe(1);
    expect(r.primary).toBe(clean.primary + 300);
  });
  it("invalid: too fast, identical, or guessing; malformed is null", () => {
    expect(rengVeSoz.score(s, perfect((i) => (i === 3 ? 60 : 500 + i)))!.valid).toBe(false);
    expect(rengVeSoz.score(s, perfect(() => 400))!.valid).toBe(false);
    const guess = { answers: s.trials.map((t) => (t.ink + 1) % 4), times: s.trials.map((_, i) => 400 + i) };
    expect(rengVeSoz.score(s, guess)!.valid).toBe(false);
    expect(rengVeSoz.score(s, { answers: [0], times: [1] })).toBeNull();
    expect(rengVeSoz.score(s, { answers: s.trials.map(() => 9), times: s.trials.map(() => 400) })).toBeNull();
  });
});

import { eyniRengdir, yaddasZenciri } from "../shared/scoring";

describe("yaddas-zenciri scoring", () => {
  const s = yaddasZenciri.schedule(11);
  const ok = (len: number, attempt = 0) => ({ taps: s.seqs[len - 3][attempt].slice(), ms: len * 400 });
  const bad = (len: number, attempt = 0) => {
    const taps = s.seqs[len - 3][attempt].slice();
    taps[taps.length - 1] = (taps[taps.length - 1] + 1) % 9;
    return { taps, ms: len * 400 };
  };
  it("schedule is deterministic: lengths 3..12, two sequences each, no immediate repeats", () => {
    expect(yaddasZenciri.schedule(11)).toEqual(s);
    expect(s.seqs).toHaveLength(10);
    s.seqs.forEach((pair, i) => pair.forEach((q) => {
      expect(q).toHaveLength(3 + i);
      q.forEach((c, j) => j && expect(c).not.toBe(q[j - 1]));
    }));
  });
  it("best length = longest repeated chain; two errors in a row end the task", () => {
    const r = yaddasZenciri.score(s, { attempts: [ok(3), ok(4), ok(5), bad(6), bad(6, 1)] })!;
    expect(r.primary).toBe(5);
    expect(r.valid).toBe(true);
    expect(r.secondary.totalMs).toBe((3 + 4 + 5 + 6 + 6) * 400);
  });
  it("one error is forgiven: a retry that succeeds continues", () => {
    const r = yaddasZenciri.score(s, { attempts: [ok(3), bad(4), ok(4, 1), bad(5), bad(5, 1)] })!;
    expect(r.primary).toBe(4);
  });
  it("failing at the first length gives 0; reaching 12 ends the task", () => {
    expect(yaddasZenciri.score(s, { attempts: [bad(3), bad(3, 1)] })!.primary).toBe(0);
    const all = Array.from({ length: 10 }, (_, i) => ok(3 + i));
    expect(yaddasZenciri.score(s, { attempts: all })!.primary).toBe(12);
  });
  it("rejects unfinished, over-long and tampered payloads", () => {
    expect(yaddasZenciri.score(s, { attempts: [ok(3)] })).toBeNull(); // not finished
    expect(yaddasZenciri.score(s, { attempts: [bad(3), bad(3, 1), ok(3)] })).toBeNull(); // plays after the end
    expect(yaddasZenciri.score(s, { attempts: [{ taps: [1, 2, 3, 4], ms: 100 }] })).toBeNull();
    expect(yaddasZenciri.score(s, { attempts: [{ taps: [99], ms: 100 }] })).toBeNull();
  });
  it("flags impossibly fast tapping", () => {
    const fast = { taps: s.seqs[0][0].slice(), ms: 30 };
    expect(yaddasZenciri.score(s, { attempts: [fast, bad(4), bad(4, 1)] })!.valid).toBe(false);
  });
});

describe("eyni-rengdir scoring", () => {
  const s = eyniRengdir.schedule(3);
  it("schedule: the three illusions in a seed-determined order", () => {
    expect(eyniRengdir.schedule(3)).toEqual(s);
    expect(s.rounds.map((r) => r.kind).sort()).toEqual(["brightness", "ebbinghaus", "muller"]);
  });
  it("counts how many times you said 'different' (all pairs are in fact equal)", () => {
    expect(eyniRengdir.score(s, { answers: [true, true, true], times: [900, 800, 700] })!.primary).toBe(0);
    const r = eyniRengdir.score(s, { answers: [false, true, false], times: [900, 800, 700] })!;
    expect(r.primary).toBe(2);
    expect(r.secondary.totalMs).toBe(2400);
  });
  it("invalid below 100 ms; malformed is null", () => {
    expect(eyniRengdir.score(s, { answers: [true, true, true], times: [50, 800, 700] })!.valid).toBe(false);
    expect(eyniRengdir.score(s, { answers: [true, true], times: [1, 2] })).toBeNull();
    expect(eyniRengdir.score(s, { answers: ["x", true, true], times: [500, 500, 500] })).toBeNull();
  });
  it("duel: fewer errors wins, then the faster total", async () => {
    const { compareRuns } = await import("../shared/duel");
    const m = bySlug("eyni-rengdir")!;
    expect(compareRuns(m, run(0, { totalMs: 5000 }), run(1, { totalMs: 1000 }))).toBe(1);
    expect(compareRuns(m, run(1, { totalMs: 1000 }), run(1, { totalMs: 5000 }))).toBe(1);
  });
});
