import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../worker/index";
import { makeD1 } from "./d1shim";
import { srt, location, paired, temporal, wason, WASON, oddOneOut, ODD_TRIALS, SRT_BLOCK_LEN } from "../shared/tasks-batch-a";
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

describe("batch A: serial reaction, object location, paired associates, temporal order, Wason, odd one out", () => {
  it("serial reaction: the random block is item 3; the score is the saving of the hidden sequence (random minus sequence)", () => {
    const s = srt.schedule(4);
    expect(s.kinds.slice(3 * SRT_BLOCK_LEN, 4 * SRT_BLOCK_LEN).every((k) => k === "rand")).toBe(true);
    const seqItems = s.items.filter((_, i) => s.kinds[i] === "seq");
    expect(seqItems.every((x) => x >= 0 && x <= 3)).toBe(true);
    // faster on the sequence than on random items
    const times = s.items.map((_, i) => (s.kinds[i] === "rand" ? 600 : 400));
    const r = srt.score(s, { choices: s.items, times })!;
    expect(r.valid).toBe(true);
    expect(r.primary).toBe(200);
    expect(srt.score(s, { choices: [9] as any, times: [1] as any })).toBeNull();
  });

  it("object location: distinct shapes per trial; a probe is asked by shape; the score is the percent of right cells", () => {
    const s = location.schedule(6);
    for (const t of s.trials) expect(new Set(t.shapes).size).toBe(t.shapes.length);
    const right = s.trials.map((t) => t.shown[t.probe]);
    expect(location.score(s, { cells: right })).toMatchObject({ primary: 100, valid: true });
    expect(location.score(s, { cells: right.map((c) => (c + 1) % 12) })!.primary).toBe(0);
    expect(location.score(s, { cells: [99] })).toBeNull();
  });

  it("paired associates: the score is the percent of cues answered with their own shape", () => {
    const s = paired.schedule(2);
    expect(new Set(s.pairs.map((p) => p.shape)).size).toBe(6);
    const right = s.order.map((pi) => s.pairs[pi].shape);
    expect(paired.score(s, { choices: right })).toMatchObject({ primary: 100 });
    expect(paired.score(s, { choices: right.map((c) => (c + 1) % 6) })!.primary).toBe(0);
    expect(paired.score(s, { choices: [1] })).toBeNull();
  });

  it("temporal order: the first of the two is the one that came earlier in the sequence", () => {
    const s = temporal.schedule(3);
    for (const t of s.trials) {
      const first = t.seq.indexOf(t.pair[0]) < t.seq.indexOf(t.pair[1]) ? 0 : 1;
      expect(first === 0).toBe(t.firstIsA);
    }
    const right = s.trials.map((t) => (t.firstIsA ? 0 : 1));
    expect(temporal.score(s, { choices: right })).toMatchObject({ primary: 100 });
    expect(temporal.score(s, { choices: right.map((c) => 1 - c) })!.primary).toBe(0);
  });

  it("Wason: the correct cards are the P card and the not-Q card; a trial counts only when the set is exact", () => {
    expect(WASON.every((w) => w.correct.length === 2)).toBe(true);
    const exact = WASON.map((w) => w.correct);
    expect(wason.score(wason.schedule(0), { picks: exact })).toMatchObject({ primary: 3, valid: true });
    expect(wason.score(wason.schedule(0), { picks: WASON.map((w) => [w.correct[0]]) })!.primary).toBe(0);
    expect(wason.score(wason.schedule(0), { picks: [[9]] as any })).toBeNull();
  });

  it("odd one out: exactly one item differs from the other three on the shared attribute; the score is percent correct", () => {
    const s = oddOneOut.schedule(5);
    expect(s.trials).toHaveLength(ODD_TRIALS);
    const right = s.trials.map((t) => t.odd);
    expect(oddOneOut.score(s, { choices: right })).toMatchObject({ primary: 100 });
    expect(oddOneOut.score(s, { choices: right.map((c) => (c + 1) % 4) })!.primary).toBe(0);
  });

  it("all six are registered and have their own mechanisms", () => {
    for (const slug of ["serial-reaction", "object-location", "paired-associates", "temporal-order-memory", "wason", "odd-one-out"]) {
      expect(SCORERS[slug], slug).toBeDefined();
      expect(MECHANISM[slug as keyof typeof MECHANISM], slug).toBeDefined();
    }
  });

  it("start and finish work over the API", async () => {
    const t = await newUser();
    for (const slug of ["serial-reaction", "object-location", "paired-associates", "temporal-order-memory", "wason", "odd-one-out"]) {
      const s = await call("POST", "/api/runs/start", t, { slug });
      expect(s.status, slug).toBe(201);
      vi.setSystemTime(Date.now() + 120000);
      const sc = s.json.schedule;
      const payload = slug === "serial-reaction"
        ? { choices: sc.items, times: sc.items.map(() => 500) }
        : slug === "object-location"
          ? { cells: sc.trials.map((x: any) => x.shown[x.probe]) }
          : slug === "paired-associates"
            ? { choices: [0, 1, 2, 3, 4, 5] }
            : slug === "temporal-order-memory"
              ? { choices: sc.trials.map(() => 0) }
              : slug === "wason"
                ? { picks: sc.cards.map(() => [0, 3]) }
                : { choices: sc.trials.map(() => 0) };
      const f = await call("POST", `/api/runs/${s.json.runId}/finish`, t, { payload });
      expect(f.status, slug).toBe(200);
      expect(f.json.valid, slug).toBe(true);
    }
  });
});
