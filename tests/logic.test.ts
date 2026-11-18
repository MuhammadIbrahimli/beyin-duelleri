import { describe, expect, it } from "vitest";
import { compareRuns, rankRuns, type DuelRun } from "../shared/duel";
import { bySlug, dailySlug } from "../shared/experiments";
import { levelFor } from "../shared/levels";
import { hashString, rng } from "../shared/rng";
import { refleks } from "../shared/scoring";
import { buildCityStats, median, percentileBeaten } from "../shared/stats";
import { hasIdenticalTimes, hasImpossibleReaction, tooManyRecentRuns } from "../shared/validity";
import { streakWithFreeze, weekStart } from "../shared/streak";

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

import { lovber, yalanciYaddas } from "../shared/scoring";
import { LOVBER_QUESTIONS } from "../config/lovber";

describe("yalanci-yaddas scoring", () => {
  const s = yalanciYaddas.schedule(21);
  const truth = s.probe.map((p) => p.kind === "old");
  const times = s.probe.map((_, i) => 600 + i);
  it("schedule: 12 studied words, probe = 6 old + 5 new + the lure, lure never studied", () => {
    expect(yalanciYaddas.schedule(21)).toEqual(s);
    expect(s.study).toHaveLength(12);
    expect(s.probe).toHaveLength(12);
    const kinds = (k: string) => s.probe.filter((p) => p.kind === k);
    expect([kinds("old").length, kinds("new").length, kinds("lure").length]).toEqual([6, 5, 1]);
    expect(s.study).not.toContain(kinds("lure")[0].word);
    kinds("old").forEach((p) => expect(s.study).toContain(p.word));
    expect(s.distract).toHaveLength(3);
    s.distract.forEach((d) => expect(d.options).toContain(d.a + d.b));
  });
  it("public view does not reveal which probe word is the lure", () => {
    const v = yalanciYaddas.publicView!(s) as { probe: unknown[] };
    expect(typeof v.probe[0]).toBe("string");
    expect(JSON.stringify(v)).not.toContain("lure");
  });
  it("accuracy is over the 11 ordinary words; the lure is reported separately", () => {
    const lureIdx = s.probe.findIndex((p) => p.kind === "lure");
    const right = truth.slice(); // lure: not seen
    const a = yalanciYaddas.score(s, { answers: right, times })!;
    expect(a.primary).toBe(100);
    expect(a.secondary.fellForLure).toBe(0);
    const fell = right.slice(); fell[lureIdx] = true;
    const b = yalanciYaddas.score(s, { answers: fell, times })!;
    expect(b.primary).toBe(100); // the lure does not change accuracy
    expect(b.secondary.fellForLure).toBe(1);
    const wrong = right.slice();
    const oldIdx = s.probe.findIndex((p) => p.kind === "old");
    wrong[oldIdx] = false;
    expect(yalanciYaddas.score(s, { answers: wrong, times })!.primary).toBe(91); // 10/11
  });
  it("invalid: identical answers or impossibly fast; malformed is null", () => {
    expect(yalanciYaddas.score(s, { answers: truth.map(() => true), times })!.valid).toBe(false);
    expect(yalanciYaddas.score(s, { answers: truth, times: times.map(() => 40) })!.valid).toBe(false);
    expect(yalanciYaddas.score(s, { answers: [true], times: [1] })).toBeNull();
  });
});

describe("lovber scoring", () => {
  const q = LOVBER_QUESTIONS[0];
  it("anchor is derived from the seed and is either the low or the high value; both occur", () => {
    const anchors = new Set(Array.from({ length: 40 }, (_, i) => lovber.schedule(i).anchor));
    expect(anchors).toEqual(new Set([q.low, q.high]));
    expect(lovber.schedule(9)).toEqual(lovber.schedule(9));
  });
  it("score = absolute distance from the true value", () => {
    const s = lovber.schedule(1);
    expect(lovber.score(s, { answer: q.truth + 75, higher: true })!.primary).toBe(75);
    expect(lovber.score(s, { answer: q.truth - 75, higher: false })!.primary).toBe(75);
    const r = lovber.score(s, { answer: 1500, higher: true })!;
    expect(r.secondary).toMatchObject({ answer: 1500, anchor: s.anchor, saidHigher: 1 });
  });
  it("rejects nonsense answers", () => {
    const s = lovber.schedule(1);
    expect(lovber.score(s, { answer: -5, higher: true })).toBeNull();
    expect(lovber.score(s, { answer: q.max + 1, higher: true })).toBeNull();
    expect(lovber.score(s, { answer: NaN, higher: true })).toBeNull();
    expect(lovber.score(s, { answer: "1000", higher: true })).toBeNull();
    expect(lovber.score(s, { answer: 100 })).toBeNull();
  });
  it("duel: closer wins", () => {
    const m = bySlug("lovber")!;
    expect(compareRuns(m, run(20), run(300))).toBe(1);
  });
});

describe("streak with a weekly free freeze", () => {
  // 2026-11-16 is a Monday
  const s = (dates: string[], today: string) => streakWithFreeze(dates, today).streak;
  it("counts consecutive days; today not done yet keeps the streak alive", () => {
    expect(s(["2026-11-18", "2026-11-17", "2026-11-16"], "2026-11-18")).toBe(3);
    expect(s(["2026-11-17", "2026-11-16"], "2026-11-18")).toBe(2);
    expect(s([], "2026-11-18")).toBe(0);
  });
  it("one missed day per week is forgiven and does not count as a day", () => {
    const r = streakWithFreeze(["2026-11-18", "2026-11-16"], "2026-11-18");
    expect(r.streak).toBe(2);
    expect(r.frozen).toEqual(["2026-11-17"]);
  });
  it("a second miss in the same week breaks the chain", () => {
    expect(s(["2026-11-19", "2026-11-16", "2026-11-15"], "2026-11-19")).toBe(1); // Tue+Wed missed, one freeze only
  });
  it("a long gap breaks it; a miss yesterday is forgiven while waiting for today", () => {
    expect(s(["2026-11-10"], "2026-11-18")).toBe(0);
    expect(s(["2026-11-16", "2026-11-15"], "2026-11-18")).toBe(2); // 17th missed (freeze), 18th still open
  });
  it("weeks run Monday to Sunday", () => {
    expect(weekStart("2026-11-22")).toBe("2026-11-16"); // Sunday
    expect(weekStart("2026-11-16")).toBe("2026-11-16");
    expect(weekStart("2026-11-23")).toBe("2026-11-23");
  });
});

import { overallScore, pointsFor } from "../shared/points";
import { validateEmail, validateName } from "../shared/profile";

describe("points", () => {
  it("anchors follow the level thresholds and interpolate in between", () => {
    expect(pointsFor("refleks", 230)).toBe(85);
    expect(pointsFor("refleks", 280)).toBe(65);
    expect(pointsFor("refleks", 255)).toBe(75);
    expect(pointsFor("refleks", 100)).toBe(100); // clamped
    expect(pointsFor("refleks", 900)).toBe(0);
    expect(pointsFor("yaddas-zenciri", 7)).toBe(75);
    expect(pointsFor("eyni-rengdir", 0)).toBe(100);
    expect(pointsFor("eyni-rengdir", 3)).toBe(10);
    expect(pointsFor("lovber", 0)).toBe(100);
  });
  it("better results never give fewer points", () => {
    for (const slug of ["refleks", "reng-ve-soz", "lovber"]) {
      let prev = 101;
      for (let raw = 0; raw <= 3500; raw += 25) { const p = pointsFor(slug, raw); expect(p).toBeLessThanOrEqual(prev); prev = p; }
    }
  });
  it("overall score averages over all experiments, so unplayed ones count as 0", () => {
    expect(overallScore([], 6)).toBe(0);
    expect(overallScore([85], 8)).toBe(10.6);
    expect(overallScore([90], 6)).toBe(15);
    expect(overallScore([90, 60, 60, 60, 60, 60], 6)).toBe(65);
  });
});

describe("profile validation", () => {
  it("names: length, characters, links", () => {
    expect(validateName("Əli Məmmədov")).toEqual({ ok: true, value: "Əli Məmmədov" });
    expect(validateName("  Анна   К. ")).toEqual({ ok: true, value: "Анна К." });
    expect(validateName("a")).toMatchObject({ ok: false, reason: "length" });
    expect(validateName("x".repeat(21))).toMatchObject({ ok: false, reason: "length" });
    expect(validateName("Ali<script>")).toMatchObject({ ok: false, reason: "chars" });
    expect(validateName("t.me/spam")).toMatchObject({ ok: false });
    expect(validateName("0501234567")).toMatchObject({ ok: false, reason: "link" });
    expect(validateName(5)).toMatchObject({ ok: false });
  });
  it("email is optional and normalised", () => {
    expect(validateEmail("")).toEqual({ ok: true, value: null });
    expect(validateEmail(null)).toEqual({ ok: true, value: null });
    expect(validateEmail(" A@B.az ")).toEqual({ ok: true, value: "a@b.az" });
    expect(validateEmail("a@b")).toMatchObject({ ok: false });
    expect(validateEmail("a b@c.com")).toMatchObject({ ok: false });
  });
});

import { goNoGo, reqemYaddasi } from "../shared/scoring";

describe("go-no-go scoring", () => {
  const s = goNoGo.schedule(9);
  const perfect = (rt: number) => ({ taps: s.trials.map((t) => (t.go ? rt : null)) });
  it("schedule: 30 trials, 21 go and 9 no-go, deterministic", () => {
    expect(goNoGo.schedule(9)).toEqual(s);
    expect(s.trials).toHaveLength(30);
    expect(s.trials.filter((t) => t.go)).toHaveLength(21);
    expect(goNoGo.schedule(10)).not.toEqual(s);
    s.trials.forEach((t) => { expect(t.gapMs).toBeGreaterThanOrEqual(500); expect(t.gapMs).toBeLessThanOrEqual(900); });
  });
  it("perfect play scores the mean reaction time", () => {
    const r = goNoGo.score(s, { taps: s.trials.map((t, i) => (t.go ? 300 + (i % 3) : null)) })!;
    expect(r.valid).toBe(true);
    expect(r.secondary).toMatchObject({ commission: 0, miss: 0, hits: 21 });
    expect(r.primary).toBeGreaterThanOrEqual(300);
    expect(r.primary).toBeLessThanOrEqual(302);
  });
  it("tapping the red square costs 300 ms, missing a green circle costs 150 ms", () => {
    const base = goNoGo.score(s, perfect(300))!;
    const noGo = s.trials.findIndex((t) => !t.go);
    const taps1 = perfect(300).taps.slice(); taps1[noGo] = 350;
    const c = goNoGo.score(s, { taps: taps1 })!;
    expect(c.secondary.commission).toBe(1);
    expect(c.primary).toBe(base.primary + 300);
    const go = s.trials.findIndex((t) => t.go);
    const taps2 = perfect(300).taps.slice(); taps2[go] = null;
    const m = goNoGo.score(s, { taps: taps2 })!;
    expect(m.secondary.miss).toBe(1);
    expect(m.primary).toBe(base.primary + 150);
  });
  it("invalid: impossible reaction, no hits, tapping everything; malformed is null", () => {
    expect(goNoGo.score(s, perfect(60))!.valid).toBe(false);
    expect(goNoGo.score(s, { taps: s.trials.map(() => null) })!.valid).toBe(false);
    expect(goNoGo.score(s, { taps: s.trials.map(() => 300) })!.valid).toBe(false);
    expect(goNoGo.score(s, { taps: [300] })).toBeNull();
    expect(goNoGo.score(s, { taps: s.trials.map(() => "x") })).toBeNull();
  });
});

describe("reqem-yaddasi (digit span) scoring", () => {
  const s = reqemYaddasi.schedule(4);
  it("uses digits 0-9 and keeps the span rules of the grid memory test", () => {
    expect(reqemYaddasi.schedule(4)).toEqual(s);
    expect(s.seqs.flat(2).every((d) => d >= 0 && d <= 9)).toBe(true);
    const ok = (len: number) => ({ digits: s.seqs[len - 3][0].slice(), ms: len * 500 });
    const bad = (len: number, a = 0) => ({ digits: [(s.seqs[len - 3][a][0] + 1) % 10], ms: 400 });
    const r = reqemYaddasi.score(s, { attempts: [ok(3), ok(4), ok(5), ok(6), bad(7), bad(7, 1)] })!;
    expect(r.primary).toBe(6);
    expect(r.valid).toBe(true);
    // the digit scorer reads "digits", not "taps"
    expect(reqemYaddasi.score(s, { attempts: [{ taps: [1, 2, 3], ms: 900 }] })).toBeNull();
    // a tapped value of 9 is fine here (it would be rejected on the 3x3 grid)
    expect(reqemYaddasi.score(s, { attempts: [{ digits: [9, 9, 9, 9], ms: 900 }] })).toBeNull(); // too long for length 3
  });
});

describe("new experiments are wired into points, levels and daily rotation", () => {
  it("points never decrease with better results", () => {
    let prev = 101;
    for (let raw = 0; raw <= 2000; raw += 20) { const p = pointsFor("go-no-go", raw); expect(p).toBeLessThanOrEqual(prev); prev = p; }
    expect(pointsFor("reqem-yaddasi", 9)).toBe(85);
    expect(pointsFor("reqem-yaddasi", 12)).toBe(100);
  });
  it("levels", () => {
    expect([300, 400, 500, 700].map((v) => levelFor("go-no-go", v))).toEqual([4, 3, 2, 1]);
    expect([3, 5, 7, 9].map((v) => levelFor("reqem-yaddasi", v))).toEqual([1, 2, 3, 4]);
  });
  it("Sunday cycles through every experiment, weekdays stay fixed", () => {
    const sundays = Array.from({ length: 8 }, (_, i) => dailySlug(new Date(Date.parse("2026-11-22T00:00:00Z") + i * 7 * 86400000).toISOString().slice(0, 10)));
    expect(new Set(sundays).size).toBe(8);
    expect(dailySlug("2026-11-16")).toBe("refleks");
  });
});
