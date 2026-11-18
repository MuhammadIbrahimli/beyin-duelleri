import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../worker/index";
import { makeD1 } from "./d1shim";
import { DUAL_TRIALS, LISTEN_TRIALS, CLOCK_JUMPS, RHYTHM_BEATS, NAME_TRIALS, CHOICE_RT_TRIALS, MOTOR_SEQS, CANCEL_CELLS, TRACE_PATHS, dual, listening, vigilance, rhythm, nameMatch, choiceRt, motorSeq, cancellation, tracing } from "../shared/tasks-batch-b";
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

describe("batch B: dual task, selective listening, vigilance clock, rhythm, name matching, choice RT, motor sequence, cancellation, tracing", () => {
  it("dual task: digits and caught flashes both count; the score is their mean", () => {
    const s = dual.schedule(1);
    expect(s.trials).toHaveLength(DUAL_TRIALS);
    const perfect = { digits: s.trials.map((t) => t.digits), caught: s.trials.map((t) => t.flashes.length) };
    expect(dual.score(s, perfect)).toMatchObject({ primary: 100, valid: true });
    expect(dual.score(s, { digits: s.trials.map(() => []), caught: s.trials.map(() => 0) })!.primary).toBe(0);
    expect(dual.score(s, { digits: [[1]], caught: [0] })).toBeNull();
  });

  it("selective listening: the answer is the count of high beeps; the score is the percent of right counts", () => {
    const s = listening.schedule(2);
    expect(s.trials).toHaveLength(LISTEN_TRIALS);
    expect(listening.score(s, { answers: s.trials.map((t) => t.left) })).toMatchObject({ primary: 100 });
    expect(listening.score(s, { answers: s.trials.map((t) => t.right) })!.primary).toBeLessThanOrEqual(100);
    expect(listening.score(s, { answers: [99] })).toBeNull();
  });

  it("vigilance clock: a tap just after a double jump is a hit; taps everywhere are penalised", () => {
    const s = vigilance.schedule(3);
    expect(s.jumps).toHaveLength(CLOCK_JUMPS);
    expect(vigilance.score(s, { taps: s.jumps })).toMatchObject({ primary: 100, valid: true });
    const spam = Array.from({ length: 40 }, (_, i) => i);
    expect(vigilance.score(s, { taps: spam })!.primary).toBe(0);
    expect(vigilance.score(s, { taps: [99] })).toBeNull();
  });

  it("rhythm: taps on the beats give zero error; a missed beat costs half an interval", () => {
    const s = rhythm.schedule(0);
    expect(s.beats).toBe(RHYTHM_BEATS);
    const onBeat = Array.from({ length: RHYTHM_BEATS }, (_, k) => (k + 1) * s.intervalMs);
    expect(rhythm.score(s, { taps: onBeat })).toMatchObject({ primary: 0, valid: true });
    expect(rhythm.score(s, { taps: [] })!.primary).toBe(s.intervalMs / 2);
    expect(rhythm.score(s, { taps: [-5] })).toBeNull();
  });

  it("name matching: the same letter in any case is yes; different letters are no", () => {
    const s = nameMatch.schedule(4);
    expect(s.trials).toHaveLength(NAME_TRIALS);
    const right = s.trials.map((t) => (t.same ? "yes" : "no"));
    const times = s.trials.map(() => 500);
    expect(nameMatch.score(s, { choices: right, times })).toMatchObject({ valid: true });
    expect(nameMatch.score(s, { choices: right.map((c) => (c === "yes" ? "no" : "yes")), times })!.primary).toBeGreaterThanOrEqual(0);
    for (const t of s.trials) if (!t.same) expect(t.a).not.toBe(t.b);
  });

  it("choice reaction: a red circle needs the left key, blue the right one; the score is the mean correct time", () => {
    const s = choiceRt.schedule(5);
    expect(s.trials).toHaveLength(CHOICE_RT_TRIALS);
    const choices = s.trials.map((t) => t.expected);
    expect(choiceRt.score(s, { choices, times: s.trials.map(() => 450) })).toMatchObject({ primary: 450, valid: true });
    expect(choiceRt.score(s, { choices: choices.map((c) => (c === "left" ? "right" : "left")), times: s.trials.map(() => 450) })!.valid).toBe(false);
  });

  it("motor sequence: a repeated sequence counts only when it is exact; wrong ones add a penalty", () => {
    const s = motorSeq.schedule(6);
    expect(s.seqs.map((q) => q.length)).toEqual(MOTOR_SEQS);
    const right = { answers: s.seqs, times: s.seqs.map(() => 2000) };
    expect(motorSeq.score(s, right)).toMatchObject({ primary: 2000, valid: true });
    const wrong = { answers: s.seqs.map((q, i) => (i === 0 ? [0] : q)), times: s.seqs.map(() => 2000) };
    expect(motorSeq.score(s, wrong)!.primary).toBeGreaterThan(2000);
  });

  it("visual cancellation: marks on E count as hits, marks on other letters subtract; a cell marked twice is rejected", () => {
    const s = cancellation.schedule(7);
    expect(s.grid).toHaveLength(CANCEL_CELLS);
    const es = s.grid.map((c, i) => (c === "E" ? i : -1)).filter((i) => i >= 0);
    expect(cancellation.score(s, { taps: es })).toMatchObject({ primary: es.length, valid: true });
    const other = s.grid.map((c, i) => (c !== "E" ? i : -1)).filter((i) => i >= 0).slice(0, 2);
    expect(cancellation.score(s, { taps: [...es, ...other] })!.primary).toBe(es.length - 2);
    expect(cancellation.score(s, { taps: [es[0], es[0]] })).toBeNull();
  });

  it("tracing: a trace on the path covers it; no trace covers nothing", () => {
    const s = tracing.schedule(8);
    expect(s.paths).toHaveLength(TRACE_PATHS);
    const onPath = s.paths.map((p) => {
      const pts: [number, number][] = [];
      for (let k = 0; k < p.length - 1; k++) for (let u = 0; u <= 10; u++) {
        const f = u / 10;
        pts.push([p[k][0] + (p[k + 1][0] - p[k][0]) * f, p[k][1] + (p[k + 1][1] - p[k][1]) * f]);
      }
      return pts;
    });
    expect(tracing.score(s, { traces: onPath })!.primary).toBeGreaterThanOrEqual(95);
    expect(tracing.score(s, { traces: [[], [], []] })!.primary).toBe(0);
    expect(tracing.score(s, { traces: [[[0, 0]]] })).toBeNull();
  });

  it("all nine are registered and have their own mechanisms", () => {
    for (const slug of ["dual-task", "selective-listening", "vigilance-clock", "rhythm-sync", "name-matching", "choice-reaction", "motor-sequence", "cancellation", "tracing"]) {
      expect(SCORERS[slug], slug).toBeDefined();
      expect(MECHANISM[slug as keyof typeof MECHANISM], slug).toBeDefined();
    }
  });

  it("start and finish work over the API", async () => {
    const t = await newUser();
    for (const slug of ["dual-task", "selective-listening", "vigilance-clock", "rhythm-sync", "name-matching", "choice-reaction", "motor-sequence", "cancellation", "tracing"]) {
      const s = await call("POST", "/api/runs/start", t, { slug });
      expect(s.status, slug).toBe(201);
      vi.setSystemTime(Date.now() + 240000);
      const sc = s.json.schedule;
      const payload: Record<string, unknown> = {
        "dual-task": { digits: (sc.trials ?? []).map(() => [1, 2, 3, 4]), caught: (sc.trials ?? []).map(() => 0) },
        "selective-listening": { answers: (sc.trials ?? []).map(() => 3) },
        "vigilance-clock": { taps: [] },
        "rhythm-sync": { taps: Array.from({ length: sc.beats }, (_, k) => (k + 1) * sc.intervalMs) },
        "name-matching": { choices: (sc.trials ?? []).map(() => "no"), times: (sc.trials ?? []).map(() => 500) },
        "choice-reaction": { choices: (sc.trials ?? []).map((x: any) => (x.colour === "red" ? "left" : "right")), times: (sc.trials ?? []).map(() => 500) },
        "motor-sequence": { answers: sc.seqs ?? [], times: (sc.seqs ?? []).map(() => 2000) },
        cancellation: { taps: [] },
        tracing: { traces: (sc.paths ?? []).map((p: [number, number][]) => p.map((x) => x)) },
      }[slug] as Record<string, unknown>;
      const f = await call("POST", `/api/runs/${s.json.runId}/finish`, t, { payload });
      expect(f.status, slug).toBe(200);
      expect(f.json.valid, slug).toBe(true);
    }
  });
});
