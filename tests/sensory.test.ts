import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../worker/index";
import { makeD1 } from "./d1shim";
import { BISECT_TRIALS, IOWA_DECKS, IOWA_TRIALS, PITCH_TRIALS, bisection, iowa, pitch } from "../shared/tasks-sensory";
import { SCORERS } from "../shared/scoring";
import { MECHANISM } from "../shared/mechanisms";
import { EXPERIMENTS } from "../shared/experiments";

let env: any;
const T0 = Date.parse("2026-11-16T10:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  env = { DB: makeD1(), SESSION_SECRET: "test-secret", SITE_ORIGIN: "https://beyin.test", ADMIN_TOKEN: "admin-secret-token" };
});
afterEach(() => vi.useRealTimers());

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await app.request(
    path,
    {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), "user-agent": "Mozilla/5.0 (Android 14)" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );
  return { status: res.status, json: (await res.json()) as any };
}
const newUser = async () => (await call("POST", "/api/session")).json.token as string;

describe("line bisection, Iowa gambling, pitch discrimination", () => {
  it("bisection: the true middle is between the two ends; the error is in percent of the line; a bias is reported", () => {
    const s = bisection.schedule(3);
    expect(s.lines).toHaveLength(BISECT_TRIALS);
    expect(s.lines.every((l) => l.x1 < 25 && l.x2 > 75)).toBe(true);
    const mids = s.lines.map((l) => (l.x1 + l.x2) / 2);
    expect(bisection.score(s, { taps: mids })).toMatchObject({ primary: 0, valid: true });
    const right = bisection.score(s, { taps: mids.map((m) => m + 3) })!;
    expect(right.primary).toBe(3);
    expect(right.secondary.biasPct).toBe(3);
    expect(bisection.score(s, { taps: mids.map(() => 150) })).toBeNull();
  });

  it("Iowa gambling: decks A and B lose on average, C and D gain; the score is the net total of the chosen cards", () => {
    const s = iowa.schedule(4);
    expect(s.outcomes.A).toHaveLength(IOWA_TRIALS);
    const avg = (d: keyof typeof s.outcomes) => s.outcomes[d].reduce((a, b) => a + b, 0) / IOWA_TRIALS;
    expect(avg("A") + avg("B")).toBeLessThan(0);
    expect(avg("C") + avg("D")).toBeGreaterThan(0);
    const onlyC = s.outcomes.C.map(() => 2);
    const net = s.outcomes.C.reduce((a, b) => a + b, 0);
    expect(iowa.score(s, { choices: onlyC })).toMatchObject({ primary: net, secondary: { deckC: IOWA_TRIALS }, valid: true });
    expect(iowa.score(s, { choices: onlyC.map(() => 9) })).toBeNull();
    expect(IOWA_DECKS).toEqual(["A", "B", "C", "D"]);
  });

  it("pitch: the higher tone is either first or second; the score is percent correct", () => {
    const s = pitch.schedule(6);
    expect(s.trials).toHaveLength(PITCH_TRIALS);
    expect(s.trials.filter((t) => t.higher === "first")).toHaveLength(PITCH_TRIALS / 2);
    const right = s.trials.map((t) => t.higher);
    expect(pitch.score(s, { choices: right })).toMatchObject({ primary: 100, valid: true });
    expect(pitch.score(s, { choices: right.map((c) => (c === "first" ? "second" : "first")) })!.primary).toBe(0);
    expect(pitch.score(s, { choices: ["left"] })).toBeNull();
  });

  it("all three are registered and have their own mechanisms", () => {
    for (const slug of ["line-bisection", "iowa-gambling", "pitch-discrimination"]) {
      expect(SCORERS[slug], slug).toBeDefined();
      expect(MECHANISM[slug as keyof typeof MECHANISM], slug).toBeDefined();
      expect(EXPERIMENTS.some((e) => e.slug === slug)).toBe(true);
    }
  });

  it("start and finish work over the API", async () => {
    const t = await newUser();
    for (const slug of ["line-bisection", "iowa-gambling", "pitch-discrimination"]) {
      const s = await call("POST", "/api/runs/start", t, { slug });
      expect(s.status, slug).toBe(201);
      vi.setSystemTime(Date.now() + 120000);
      const sc = s.json.schedule;
      const payload = slug === "line-bisection"
        ? { taps: sc.lines.map((l: any) => (l.x1 + l.x2) / 2) }
        : slug === "iowa-gambling"
          ? { choices: sc.outcomes.A.map(() => 2) }
          : { choices: sc.trials.map((x: any) => x.higher) };
      const f = await call("POST", `/api/runs/${s.json.runId}/finish`, t, { payload });
      expect(f.status, slug).toBe(200);
      expect(f.json.valid, slug).toBe(true);
    }
  });
});
