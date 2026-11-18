import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../worker/index";
import { makeD1 } from "./d1shim";
import { fluency, flicker, tojTask, closure, sound, FLICKER_TRIALS, TOJ_TRIALS, CLOSURE_TRIALS, SOUND_TRIALS, FLUENCY_LETTER } from "../shared/tasks-batch-c";
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

describe("batch C: verbal fluency, flicker fusion, temporal order judgment, gestalt closure, sound localization", () => {
  it("verbal fluency: the letter depends on the language; only words of the right shape that start with it count, each once", () => {
    expect(fluency.schedule(1, "ru")).toEqual({ letter: FLUENCY_LETTER.ru });
    expect(fluency.schedule(1, "az")).toEqual({ letter: FLUENCY_LETTER.az });
    const s = fluency.schedule(1, "az");
    expect(fluency.score(s, { words: ["sakit", "Sakit", "soba", "dəniz", "a1", "s"] })).toMatchObject({ primary: 2, valid: true });
    expect(fluency.score(s, { words: [] })!.primary).toBe(0);
    expect(fluency.score(s, { words: [1] as any })).toBeNull();
  });

  it("flicker fusion: three thresholds in hertz; out-of-range values are rejected", () => {
    expect(flicker.schedule(0)).toMatchObject({ trials: FLICKER_TRIALS });
    expect(flicker.score(flicker.schedule(0), { thresholds: [10, 12, 14] })).toMatchObject({ primary: 12, valid: true });
    expect(flicker.score(flicker.schedule(0), { thresholds: [500, 1, 1] })).toBeNull();
  });

  it("temporal order judgment: the presented first side is the answer; the score is percent correct", () => {
    const s = tojTask.schedule(2);
    expect(s.trials).toHaveLength(TOJ_TRIALS);
    const pub = tojTask.publicView!(s) as { trials: { soa: number; first: string }[] };
    expect(pub.trials.every((t) => t.first === "left" || t.first === "right")).toBe(true);
    expect(tojTask.score(s, { choices: s.trials.map((t) => t.first) })).toMatchObject({ primary: 100 });
    expect(tojTask.score(s, { choices: s.trials.map((t) => (t.first === "left" ? "right" : "left")) })!.primary).toBe(0);
  });

  it("gestalt closure: the shape is the answer; the score is percent correct", () => {
    const s = closure.schedule(3);
    expect(s.trials).toHaveLength(CLOSURE_TRIALS);
    expect(closure.score(s, { choices: s.trials.map((t) => t.shape) })).toMatchObject({ primary: 100 });
    expect(closure.score(s, { choices: [9] as any })).toBeNull();
  });

  it("sound localization: the answer is left, centre or right from the pan; the score is percent correct", () => {
    const s = sound.schedule(4);
    expect(s.trials).toHaveLength(SOUND_TRIALS);
    const name = (p: number) => (p < 0 ? "left" : p > 0 ? "right" : "center");
    expect(sound.score(s, { choices: s.trials.map((t) => name(t.pan)) })).toMatchObject({ primary: 100 });
    expect(sound.score(s, { choices: s.trials.map(() => "up") as any })).toBeNull();
    expect(sound.publicView!(s)).toEqual({ trials: s.trials.map(() => ({})) });
  });

  it("all five are registered and have their own mechanisms", () => {
    for (const slug of ["verbal-fluency", "flicker-fusion", "temporal-order-judgment", "gestalt-closure", "sound-localization"]) {
      expect(SCORERS[slug], slug).toBeDefined();
      expect(MECHANISM[slug as keyof typeof MECHANISM], slug).toBeDefined();
    }
  });

  it("start and finish work over the API", async () => {
    const t = await newUser();
    for (const slug of ["verbal-fluency", "flicker-fusion", "temporal-order-judgment", "gestalt-closure", "sound-localization"]) {
      const s = await call("POST", "/api/runs/start", t, { slug, lang: "az" });
      expect(s.status, slug).toBe(201);
      vi.setSystemTime(Date.now() + 120000);
      const sc = s.json.schedule;
      const payload: Record<string, unknown> = {
        "verbal-fluency": { words: ["sakit", "soba"] },
        "flicker-fusion": { thresholds: [10, 11, 12] },
        "temporal-order-judgment": { choices: (Array.isArray(sc.trials) ? sc.trials : []).map((x: any) => x.first) },
        "gestalt-closure": { choices: (Array.isArray(sc.trials) ? sc.trials : []).map(() => 0) },
        "sound-localization": { choices: (Array.isArray(sc.trials) ? sc.trials : []).map(() => "center") },
      }[slug] as Record<string, unknown>;
      const f = await call("POST", `/api/runs/${s.json.runId}/finish`, t, { payload });
      expect(f.status, slug).toBe(200);
      expect(f.json.valid, slug).toBe(true);
    }
  });
});
