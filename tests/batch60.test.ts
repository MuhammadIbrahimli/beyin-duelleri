import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../worker/index";
import { makeD1 } from "./d1shim";
import { IB_TRIALS, TAP_TRIALS, inattentional, tapping, contrast, matching, MATCH_TRIALS } from "../shared/tasks-batch60";
import { SCORERS } from "../shared/scoring";
import { MECHANISM } from "../shared/mechanisms";

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

describe("inattentional blindness, finger tapping, contrast detection, probability matching", () => {
  it("inattentional blindness: a surprise is noticed only when the yes and the shape are right; control trials need a no", () => {
    const s = inattentional.schedule(2);
    expect(s.trials).toHaveLength(IB_TRIALS);
    expect(s.trials.filter((t) => t.surprise)).toHaveLength(2);
    const perfect = s.trials.map((t) => (t.surprise ? { seen: true, shape: t.shape } : { seen: false, shape: -1 }));
    expect(inattentional.score(s, { answers: perfect })).toMatchObject({ primary: 100, valid: true });
    const blind = s.trials.map((t) => (t.surprise ? { seen: false, shape: -1 } : { seen: false, shape: -1 }));
    expect(inattentional.score(s, { answers: blind })!.primary).toBe(33);
    expect(inattentional.score(s, { answers: [{ seen: "yes", shape: 0 }] })).toBeNull();
  });

  it("finger tapping: the score is the mean taps in ten seconds; more than 120 taps is not trusted", () => {
    const s = tapping.schedule(1);
    expect(s.trials).toBe(TAP_TRIALS);
    expect(tapping.score(s, { taps: [50, 60] })).toMatchObject({ primary: 55, valid: true });
    expect(tapping.score(s, { taps: [200, 60] })!.invalidReason).toBe("impossible_rate");
    expect(tapping.score(s, { taps: [50] })).toBeNull();
  });

  it("contrast detection: the pattern side is the answer; percent correct is the score", () => {
    const s = contrast.schedule(5);
    const right = s.trials.map((t) => t.pattern);
    expect(contrast.score(s, { choices: right })).toMatchObject({ primary: 100, valid: true });
    expect(contrast.score(s, { choices: right.map((c) => (c === "left" ? "right" : "left")) })!.primary).toBe(0);
    expect(contrast.score(s, { choices: ["up"] })).toBeNull();
  });

  it("probability matching: always predicting the frequent outcome scores its share; the choices must be A or B", () => {
    const s = matching.schedule(8);
    expect(s.outcomes).toHaveLength(MATCH_TRIALS);
    const share = Math.round((s.outcomes.filter((o) => o === "A").length / MATCH_TRIALS) * 100);
    expect(matching.score(s, { choices: s.outcomes.map(() => "A") })!.primary).toBe(share);
    expect(matching.score(s, { choices: s.outcomes })).toMatchObject({ primary: 100 });
    expect(matching.score(s, { choices: s.outcomes.map(() => "C") })).toBeNull();
  });

  it("all four are registered and have their own mechanisms", () => {
    for (const slug of ["inattentional-blindness", "finger-tapping", "contrast-detection", "probability-matching"]) {
      expect(SCORERS[slug], slug).toBeDefined();
      expect(MECHANISM[slug as keyof typeof MECHANISM], slug).toBeDefined();
    }
  });

  it("start and finish work over the API", async () => {
    const t = await newUser();
    for (const slug of ["inattentional-blindness", "finger-tapping", "contrast-detection", "probability-matching"]) {
      const s = await call("POST", "/api/runs/start", t, { slug });
      expect(s.status, slug).toBe(201);
      vi.setSystemTime(Date.now() + 120000);
      const sc = s.json.schedule;
      const payload = slug === "inattentional-blindness"
        ? { answers: sc.trials.map(() => ({ seen: false, shape: -1 })) }
        : slug === "finger-tapping"
          ? { taps: [40, 42] }
          : slug === "contrast-detection"
            ? { choices: sc.trials.map(() => "left") }
            : { choices: sc.outcomes.map(() => "A") };
      const f = await call("POST", `/api/runs/${s.json.runId}/finish`, t, { payload });
      expect(f.status, slug).toBe(200);
      expect(f.json.valid, slug).toBe(true);
    }
  });
});
