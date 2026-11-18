import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../worker/index";
import { pushConfigured, sendStreakReminders, validEndpoint, vapidHeader } from "../worker/push";
import { makeD1 } from "./d1shim";

let env: any;
const T0 = Date.parse("2026-11-16T10:00:00Z"); // a Monday

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

async function play(token: string, times: number[], opts: { daily?: boolean } = {}) {
  const start = await call("POST", "/api/runs/start", token, { slug: "refleks", ...opts });
  expect(start.status).toBe(201);
  vi.setSystemTime(Date.now() + 40000);
  const fin = await call("POST", `/api/runs/${start.json.runId}/finish`, token, { payload: { times, earlyTaps: 0 } });
  expect(fin.status).toBe(200);
  return fin;
}
const GOOD = [250, 260, 255, 270, 245];

describe("account recovery code", () => {
  it("a code restores the account on a fresh device; a new code replaces the old; wrong codes fail", async () => {
    const t = await newUser();
    await call("PATCH", "/api/me", t, { nickname: "Əli Test", city: "baki" });
    await play(t, GOOD);
    const { code } = (await call("POST", "/api/me/recovery", t)).json;
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    const row = await env.DB.prepare("SELECT recovery_hash FROM users WHERE nickname = 'Əli Test'").first();
    expect(row.recovery_hash).toBeTruthy();
    expect(row.recovery_hash).not.toContain(code.replace(/-/g, "")); // only a keyed hash is stored

    const fresh = await newUser(); // the empty anonymous account the new device just created
    const r = await call("POST", "/api/session/restore", undefined, { code: code.toLowerCase().replace(/-/g, " "), token: fresh });
    expect(r.status).toBe(200);
    expect(r.json.user).toMatchObject({ nickname: "Əli Test", city: "baki" });
    expect((await call("GET", "/api/me/passport", r.json.token)).json.overall.played).toBe(1);
    expect((await call("GET", "/api/me", fresh)).status).toBe(401); // the empty throw-away account is gone

    expect((await call("POST", "/api/session/restore", undefined, { code: "AAAA-BBBB-CCCC" })).status).toBe(404);
    expect((await call("POST", "/api/session/restore", undefined, { code: "short" })).status).toBe(400);
    const { code: code2 } = (await call("POST", "/api/me/recovery", t)).json;
    expect(code2).not.toBe(code);
    expect((await call("POST", "/api/session/restore", undefined, { code })).status).toBe(404); // the old code is dead
    expect((await call("POST", "/api/session/restore", undefined, { code: code2 })).status).toBe(200);
  });

  it("restoring does not delete the current account when it already has results", async () => {
    const [a, b] = [await newUser(), await newUser()];
    await play(b, GOOD);
    const { code } = (await call("POST", "/api/me/recovery", a)).json;
    await call("POST", "/api/session/restore", undefined, { code, token: b });
    expect((await call("GET", "/api/me", b)).status).toBe(200);
  });
});

describe("web push streak reminders", () => {
  const keys = async () => {
    const k = (await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const jwk = await webcrypto.subtle.exportKey("jwk", k.privateKey);
    const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")]);
    return { VAPID_PRIVATE: jwk.d!, VAPID_PUBLIC: pub.toString("base64url"), publicKey: k.publicKey };
  };
  const EP = "https://fcm.googleapis.com/fcm/send/abc123";

  it("only real push services are accepted as endpoints", () => {
    expect(validEndpoint(EP)).toBe(EP);
    expect(validEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x")).toBeTruthy();
    const bad = ["http://fcm.googleapis.com/x", "https://evil.example.com/x", "https://googleapis.com.evil.com/x", "https://169.254.169.254/x", "javascript:alert(1)", 5, null, "https://fcm.googleapis.com/" + "a".repeat(700)];
    for (const b of bad) expect(validEndpoint(b as any), String(b)).toBeNull();
  });

  it("the VAPID token is a valid ES256 JWT for the push service origin", async () => {
    const k = await keys();
    const h = await vapidHeader({ ...env, VAPID_PRIVATE: k.VAPID_PRIVATE, VAPID_PUBLIC: k.VAPID_PUBLIC }, EP, T0);
    const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=(.+)$/.exec(h)!;
    expect(m[4]).toBe(k.VAPID_PUBLIC);
    const claims = JSON.parse(Buffer.from(m[2], "base64url").toString());
    expect(claims).toMatchObject({ aud: "https://fcm.googleapis.com", sub: "https://beyin.test" });
    expect(claims.exp).toBe(Math.floor(T0 / 1000) + 12 * 3600);
    const ok = await webcrypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, k.publicKey, Buffer.from(m[3], "base64url"), new TextEncoder().encode(`${m[1]}.${m[2]}`));
    expect(ok).toBe(true);
  });

  it("subscribe, key endpoint, and reminders only for people whose streak is at risk", async () => {
    const k = await keys();
    env = { ...env, VAPID_PRIVATE: k.VAPID_PRIVATE, VAPID_PUBLIC: k.VAPID_PUBLIC };
    expect(pushConfigured(env)).toBe(true);
    const [risk, done, idle] = [await newUser(), await newUser(), await newUser()];
    expect((await call("GET", "/api/push/key", risk)).json.key).toBe(k.VAPID_PUBLIC);
    expect((await call("POST", "/api/push/subscribe", risk, { endpoint: "https://evil.example.com/x" })).status).toBe(400);
    for (const [u, n] of [[risk, 1], [done, 2], [idle, 3]] as const) {
      expect((await call("POST", "/api/push/subscribe", u, { endpoint: `${EP}${n}`, lang: "ru" })).status).toBe(200);
    }
    // Monday: `risk` and `done` finish the daily test
    await play(risk, GOOD, { daily: true });
    await play(done, GOOD, { daily: true });
    // Tuesday 19:30 Baku: `done` has played today as well (inserted directly: Tuesday's daily is another experiment)
    vi.setSystemTime(Date.parse("2026-11-17T15:30:00Z"));
    const runOf = await env.DB.prepare("SELECT d.run_id AS r FROM daily d JOIN push_subs p ON p.user_id = d.user_id WHERE p.endpoint = ?").bind(`${EP}2`).first();
    await env.DB.prepare("INSERT INTO daily (user_id, date, run_id) SELECT user_id, '2026-11-17', ? FROM push_subs WHERE endpoint = ?").bind(runOf.r, `${EP}2`).run();

    const calls: { url: string; auth: string }[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (url: any, init: any) => {
      calls.push({ url: String(url), auth: init.headers.authorization });
      return new Response(null, { status: String(url).endsWith("3") ? 410 : 201 });
    }) as any;
    try {
      // only `risk` is at risk: played yesterday, not today
      expect(await sendStreakReminders(env, Date.now())).toEqual({ sent: 1, removed: 0 });
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe(`${EP}1`);
      expect(calls[0].auth).toMatch(/^vapid t=/);
      // never twice on the same day
      expect(await sendStreakReminders(env, Date.now())).toEqual({ sent: 0, removed: 0 });
      // outside the evening window nothing is sent
      await env.DB.prepare("UPDATE push_subs SET last_sent_day = NULL").run();
      expect(await sendStreakReminders(env, Date.parse("2026-11-17T08:00:00Z"))).toEqual({ sent: 0, removed: 0 });
      // a gone subscription (410) is deleted: make `idle` at risk too
      await env.DB.prepare("INSERT INTO daily (user_id, date, run_id) SELECT p.user_id, '2026-11-16', ? FROM push_subs p WHERE p.endpoint = ?").bind(runOf.r, `${EP}3`).run();
      const r = await sendStreakReminders(env, Date.now());
      expect(r.removed).toBe(1);
      expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM push_subs WHERE endpoint = ?").bind(`${EP}3`).first()).n).toBe(0);
    } finally { globalThis.fetch = real; }

    expect((await call("POST", "/api/push/unsubscribe", risk, { endpoint: `${EP}1` })).status).toBe(200);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM push_subs WHERE endpoint = ?").bind(`${EP}1`).first()).n).toBe(0);
  });

  it("without VAPID keys the key endpoint is 404 and nothing is sent", async () => {
    const t = await newUser();
    expect((await call("GET", "/api/push/key", t)).status).toBe(404);
    expect(await sendStreakReminders(env, Date.parse("2026-11-17T15:30:00Z"))).toEqual({ sent: 0, removed: 0 });
  });
});

describe("recap", () => {
  it("summarises the last 7 and 30 days: runs, active days, score change, strongest test", async () => {
    const t = await newUser();
    expect((await call("GET", "/api/me/recap?period=week", t)).json).toMatchObject({ runs: 0, activeDays: 0, best: null, rank: null, overall: { score: 0, delta: 0 } });

    await play(t, GOOD);
    vi.setSystemTime(Date.now() + 86400000);
    await play(t, [240, 250, 245, 260, 235]);
    const w = (await call("GET", "/api/me/recap?period=week", t)).json;
    expect(w).toMatchObject({ period: "week", days: 7, runs: 2, activeDays: 2 });
    expect(w.best.slug).toBe("refleks");
    expect(w.overall.score).toBeGreaterThan(0);
    expect(w.overall.delta).toBe(w.overall.score); // nothing before the window
    expect(w.rank).toEqual({ place: 1, of: 1 });

    // 10 days later the week is empty, the month still has both runs, and the score itself is unchanged
    vi.setSystemTime(Date.now() + 10 * 86400000);
    const w2 = (await call("GET", "/api/me/recap?period=week", t)).json;
    expect(w2.runs).toBe(0);
    expect(w2.overall).toMatchObject({ delta: 0, score: w.overall.score });
    expect((await call("GET", "/api/me/recap?period=month", t)).json).toMatchObject({ period: "month", days: 30, runs: 2 });
    expect((await call("GET", "/api/me/recap")).status).toBe(401);
  });
});

import { CATEGORIES } from "../shared/categories";
import { EXPERIMENTS } from "../shared/experiments";

describe("home categories", () => {
  it("every experiment is in exactly one category, and categories name only real experiments", () => {
    const all = CATEGORIES.flatMap((c) => c.slugs);
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual(EXPERIMENTS.map((e) => e.slug).sort());
    expect(CATEGORIES.length).toBeGreaterThanOrEqual(5);
    expect(CATEGORIES.length).toBeLessThanOrEqual(6);
  });
  it("/experiments reports per-test progress for the user (runs and best points)", async () => {
    const t = await newUser();
    const before = (await call("GET", "/api/experiments", t)).json.progress;
    expect(before.refleks).toEqual({ runs: 0, points: null });
    await play(t, GOOD);
    const after = (await call("GET", "/api/experiments", t)).json.progress;
    expect(after.refleks.runs).toBe(1);
    expect(after.refleks.points).toBeGreaterThan(0);
    expect(after["go-no-go"].runs).toBe(0);
  });
});

import { toCsv } from "../worker/routes/admin";

describe("admin export", () => {
  it("needs the admin token, and the export has analytics but no names or emails", async () => {
    const t = await newUser();
    await play(t, GOOD);
    const noAuth = await app.request("/api/admin/export?format=json", {}, env);
    expect(noAuth.status).toBe(401);
    const res = await app.request("/api/admin/export?format=json", { headers: { "x-admin-token": "admin-secret-token" } }, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("beyin-analytics-");
    const text = await res.text();
    const json = JSON.parse(text);
    expect(json.totals.users).toBeGreaterThan(0);
    expect(json.experiments.length).toBe(EXPERIMENTS.length);
    expect(text).not.toMatch(/"nickname"|"email"/);
  });
  it("CSV export is one file with labelled tables", async () => {
    const res = await app.request("/api/admin/export?format=csv", { headers: { "x-admin-token": "admin-secret-token" } }, env);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const csv = await res.text();
    expect(csv.split("\n")[0]).toBe("# analytics");
    expect(csv).toContain("# analytics.totals");
    expect(csv).toContain("# analytics.experiments");
  });
  it("CSV cells with commas, quotes and newlines are quoted", () => {
    expect(toCsv({ a: { t: 'x,"y"\nz' } })).toContain('"x,""y""\nz"');
  });
});

import { nback, nbackTargets } from "../shared/attention-tasks";
import { SCORERS } from "../shared/scoring";

describe("n-back", () => {
  it("targets are exactly the positions that repeat the letter two steps back, and a share of them exists", () => {
    const s = nback.schedule(11);
    expect(s.letters).toHaveLength(26);
    const t = nbackTargets(s.letters);
    expect(t.slice(0, 2)).toEqual([false, false]);
    expect(t.filter(Boolean).length).toBeGreaterThan(3);
    t.forEach((isT, i) => { if (i >= 2 && !isT) expect(s.letters[i]).not.toBe(s.letters[i - 2]); });
  });
  it("accuracy in percent; perfect answers score 100 and are valid; all-yes is invalid", () => {
    const s = nback.schedule(11);
    const targets = nbackTargets(s.letters);
    const perfect = nback.score(s, { responses: targets })!;
    expect(perfect).toMatchObject({ primary: 100, valid: true });
    const yes = nback.score(s, { responses: s.letters.map(() => true) })!;
    expect(yes.invalidReason).toBe("tapping_everything");
    expect(nback.score(s, { responses: [true] })).toBeNull();
  });
});

describe("registry", () => {
  it("every experiment has a scorer, and the three new ones are registered", () => {
    for (const e of EXPERIMENTS) expect(SCORERS[e.slug], e.slug).toBeDefined();
    expect(SCORERS["n-back"]).toBe(nback);
  });
});

describe("new experiments over the API", () => {
  it("start and finish work for n-back with plausible payloads", async () => {
    const t = await newUser();
    for (const slug of ["n-back"]) {
      const s = await call("POST", "/api/runs/start", t, { slug });
      expect(s.status, slug).toBe(201);
      vi.setSystemTime(Date.now() + 90000);
      const payload = slug === "n-back"
        ? { responses: nbackTargets(s.json.schedule.letters) }
        : { choices: s.json.schedule.trials.map((x: any) => x.expected), times: s.json.schedule.trials.map(() => 500) };
      const f = await call("POST", `/api/runs/${s.json.runId}/finish`, t, { payload });
      expect(f.status, slug).toBe(200);
      expect(f.json.valid, slug).toBe(true);
    }
  });
});

import { ROTATION_TRIALS, SWITCH_TRIALS, DSST_TRIALS, SYMBOLS, dsst, rotation, switchAnswer, switchTask, transform, type Pt } from "../shared/tasks-more";

describe("PVT, DSST, mental rotation, task switching", () => {
  it("DSST: the key is a permutation of the symbols and every digit maps to one; correct choices score", () => {
    const s = dsst.schedule(9);
    expect([...s.symbols].sort()).toEqual([...SYMBOLS].sort());
    expect(s.digits).toHaveLength(DSST_TRIALS);
    const choices = s.digits.map((d) => s.symbols[d - 1]);
    expect(dsst.score(s, { choices, times: s.digits.map(() => 600) })).toMatchObject({ valid: true, primary: 600 });
    const wrong = choices.map((c) => (c === s.symbols[0] ? s.symbols[1] : s.symbols[0]));
    expect(dsst.score(s, { choices: wrong, times: s.digits.map(() => 600) })!.secondary.errors).toBeGreaterThan(0);
    expect(dsst.score(s, { choices: ["x"], times: [1] })).toBeNull();
  });

  it("mental rotation: the same shape turned is 'same'; a mirror image that is not a turn is 'different'", () => {
    const s = rotation.schedule(12);
    expect(s.trials).toHaveLength(ROTATION_TRIALS);
    const eq = (a: Pt[], b: Pt[]) => a.every((p, i) => Math.abs(p[0] - b[i][0]) < 0.02 && Math.abs(p[1] - b[i][1]) < 0.02);
    for (const tr of s.trials) {
      const turned = [0, 1, 2, 3, 4, 5].some((k) => eq(transform(tr.left, k * 60, false), tr.right));
      expect(turned).toBe(tr.same);
    }
    const choices = s.trials.map((t) => (t.same ? "yes" : "no"));
    expect(rotation.score(s, { choices, times: s.trials.map(() => 900) })).toMatchObject({ valid: true, primary: 900 });
  });

  it("task switching: parity or size by cue; switch trials are marked; the switch cost is reported", () => {
    const s = switchTask.schedule(21);
    expect(s.trials).toHaveLength(SWITCH_TRIALS);
    expect(s.trials[0].cond).toBeUndefined();
    for (const tr of s.trials) expect(tr.expected).toBe(switchAnswer(tr.digit, tr.cue));
    expect(switchAnswer(3, "parity")).toBe("left");
    expect(switchAnswer(8, "parity")).toBe("right");
    expect(switchAnswer(3, "magnitude")).toBe("left");
    expect(switchAnswer(7, "magnitude")).toBe("right");
    const switches = s.trials.filter((t, i) => i > 0 && t.cond === "cost").length;
    expect(switches).toBeGreaterThan(3);
    const choices = s.trials.map((t) => t.expected);
    const times = s.trials.map((t) => (t.cond === "cost" ? 800 : 600));
    const r = switchTask.score(s, { choices, times })!;
    expect(r.valid).toBe(true);
    expect(r.secondary.switchCostMs).toBe(200);
  });
});

describe("new tests over the API", () => {
  it("start and finish work for dsst, mental-rotation and task-switch", async () => {
    const t = await newUser();
    for (const slug of ["dsst", "mental-rotation", "task-switch"]) {
      const s = await call("POST", "/api/runs/start", t, { slug });
      expect(s.status, slug).toBe(201);
      vi.setSystemTime(Date.now() + 120000);
      const sc = s.json.schedule;
      const payload = slug === "dsst"
          ? { choices: sc.digits.map((d: number) => sc.symbols[d - 1]), times: sc.digits.map(() => 700) }
          : slug === "mental-rotation"
            ? { choices: sc.trials.map((x: any) => (x.same ? "yes" : "no")), times: sc.trials.map(() => 900) }
            : { choices: sc.trials.map((x: any) => x.expected), times: sc.trials.map(() => 600) };
      const f = await call("POST", `/api/runs/${s.json.runId}/finish`, t, { payload });
      expect(f.status, slug).toBe(200);
      expect(f.json.valid, slug).toBe(true);
    }
  });
});

import { hanoi, replayHanoi } from "../shared/tasks-next";

describe("Tower of Hanoi", () => {
  it("Hanoi: the optimal 3-disk solution is solved with zero extra moves; illegal moves are rejected", () => {
    const optimal3: [number, number][] = [[0, 2], [0, 1], [2, 1], [0, 2], [1, 0], [1, 2], [0, 2]];
    expect(replayHanoi(3, optimal3)).toEqual({ solved: true });
    expect(replayHanoi(3, [[0, 1], [0, 1]])).toBeNull(); // bigger disk (2) onto a smaller one (1)
    expect(replayHanoi(3, [[1, 2]])).toBeNull(); // empty peg
    const s = hanoi.schedule(1);
    const r = hanoi.score(s, { puzzles: [optimal3, [[0, 2]]] })!;
    expect(r.primary).toBe(0 + 20); // second puzzle unsolved: penalty
    expect(r.secondary).toMatchObject({ solved: 1 });
    expect(hanoi.score(s, { puzzles: [[[0, 1]]] })).toBeNull(); // wrong number of puzzles
  });

});

describe("new tests over the API (batch 4)", () => {
  it("start and finish work for hanoi", async () => {
    const t = await newUser();
    for (const slug of ["hanoi"]) {
      const s = await call("POST", "/api/runs/start", t, { slug });
      expect(s.status, slug).toBe(201);
      vi.setSystemTime(Date.now() + 120000);
      const sc = s.json.schedule;
      const payload = slug === "hanoi"
        ? { puzzles: [[[0, 2], [0, 1], [2, 1], [0, 2], [1, 0], [1, 2], [0, 2]], []] }
        : slug === "sart"
          ? { taps: sc.digits.map((d: number) => d !== 3) }
          : slug === "navon"
            ? { choices: sc.trials.map((x: any) => x.expected), times: sc.trials.map(() => 600) }
            : { answers: sc.seqs.map((q: number[]) => [...q].reverse()) };
      const f = await call("POST", `/api/runs/${s.json.runId}/finish`, t, { payload });
      expect(f.status, slug).toBe(200);
      expect(f.json.valid, slug).toBe(true);
    }
  });
});

import { BART_BALLOONS, BART_MAX_PUMPS, CHANGE_TRIALS, MATRIX_PUZZLES, SEARCH_TRIALS, bart, changeDetection, matrix, visualSearch } from "../shared/tasks-distinct";

describe("visual search, balloon risk, matrix, change detection", () => {
  it("visual search: half the displays have a T; the search cost is the 16-item minus the 8-item time", () => {
    const s = visualSearch.schedule(2);
    expect(s.trials).toHaveLength(SEARCH_TRIALS);
    expect(s.trials.filter((t) => t.items.some((x) => x.ch === "T")).length).toBe(SEARCH_TRIALS / 2);
    const pub = visualSearch.publicView!(s) as any;
    expect(JSON.stringify(pub)).not.toContain("present");
    const choices = s.trials.map((t) => (t.items.some((x) => x.ch === "T") ? "yes" : "no"));
    const times = s.trials.map((t) => (t.cond === "cost" ? 900 : 600));
    expect(visualSearch.score(s, { choices, times })).toMatchObject({ valid: true, secondary: { searchSlopeMs: 300 } });
  });

  it("BART: points are five per pump on balloons that were collected; a pop loses the balloon; pumping past the pop is rejected", () => {
    const s = bart.schedule(5);
    expect(s.explode).toHaveLength(BART_BALLOONS);
    expect(s.explode.every((x) => x >= 1 && x <= BART_MAX_PUMPS)).toBe(true);
    const safe = s.explode.map((ex) => Math.max(0, ex - 1)); // one pump short of every pop, then collect
    const got = bart.score(s, { pumps: safe })!;
    expect(got.primary).toBe(safe.reduce((a, p) => a + p * 5, 0));
    const popAll = bart.score(s, { pumps: s.explode })!;
    expect(popAll.primary).toBe(0);
    expect(popAll.secondary.popped).toBe(BART_BALLOONS);
    const tooFar = s.explode.map((ex) => ex + 1);
    expect(bart.score(s, { pumps: tooFar })).toBeNull();
    expect(bart.score(s, { pumps: [1] })).toBeNull();
  });

  it("matrix: each puzzle's correct option completes the rule (count across rows, shape per row, colour per column)", () => {
    const s = matrix.schedule(6);
    expect(s.puzzles).toHaveLength(MATRIX_PUZZLES);
    for (const p of s.puzzles) {
      const ans = p.options[p.answer];
      expect(ans.n).toBe(3);      // column 3 of the last row: count 3
      expect(ans.shape).toBe(2);  // row 3 shape
      expect(ans.colour).toBe(2); // column 3 colour
      const others = p.options.filter((_, i) => i !== p.answer);
      for (const o of others) expect(o.n === ans.n && o.shape === ans.shape && o.colour === ans.colour).toBe(false);
    }
    const perfect = s.puzzles.map((p) => p.answer);
    expect(matrix.score(s, { choices: perfect })).toMatchObject({ primary: MATRIX_PUZZLES, valid: true });
    expect(matrix.score(s, { choices: perfect.map(() => -1) })!.primary).toBe(0);
    expect(matrix.score(s, { choices: [9] })).toBeNull();
  });

  it("change detection: a changed probe differs in exactly one square; the score is percent correct", () => {
    const s = changeDetection.schedule(9);
    expect(s.trials).toHaveLength(CHANGE_TRIALS);
    for (const t of s.trials) {
      const diff = t.set.filter((sq, i) => sq.colour !== t.probe[i].colour).length;
      expect(diff).toBe(t.same ? 0 : 1);
    }
    const choices = s.trials.map((t) => (t.same ? "yes" : "no"));
    expect(changeDetection.score(s, { choices, times: s.trials.map(() => 900) })).toMatchObject({ primary: 100, valid: true });
    const wrong = choices.map((c) => (c === "yes" ? "no" : "yes"));
    expect(changeDetection.score(s, { choices: wrong, times: s.trials.map(() => 900) })!.primary).toBe(0);
  });
});

describe("new tests over the API (distinct batch)", () => {
  it("start and finish work for visual-search, bart, matrix and change-detection", async () => {
    const t = await newUser();
    for (const slug of ["visual-search", "bart", "matrix", "change-detection"]) {
      const s = await call("POST", "/api/runs/start", t, { slug });
      expect(s.status, slug).toBe(201);
      vi.setSystemTime(Date.now() + 120000);
      const sc = s.json.schedule;
      const payload = slug === "visual-search"
        ? { choices: sc.trials.map((x: any) => (x.items.some((i: any) => i.ch === "T") ? "yes" : "no")), times: sc.trials.map(() => 700) }
        : slug === "bart"
          ? { pumps: sc.explode.map((e: number) => Math.max(0, e - 1)) }
          : slug === "matrix"
            ? { choices: sc.puzzles.map(() => 0) }
            : { choices: sc.trials.map((x: any) => (x.probe && x.set && JSON.stringify(x.set) === JSON.stringify(x.probe) ? "yes" : "no")), times: sc.trials.map(() => 900) };
      const f = await call("POST", `/api/runs/${s.json.runId}/finish`, t, { payload });
      expect(f.status, slug).toBe(200);
      expect(f.json.valid, slug).toBe(true);
    }
  });
});

import { MECHANISM } from "../shared/mechanisms";
import { EXPERIMENTS as ALL } from "../shared/experiments";
import { posner, mot } from "../shared/tasks-orienting";

describe("no duplicate mechanisms", () => {
  it("every experiment names its mechanism, and no two experiments share one", () => {
    const slugs = ALL.map((e) => e.slug);
    expect(Object.keys(MECHANISM).sort()).toEqual([...slugs].sort());
    const values = Object.values(MECHANISM);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("Posner cueing and multiple object tracking", () => {
  it("Posner: two thirds of the cues are valid; an invalid cue points to the other side; the cost is the invalid minus the valid time", () => {
    const s = posner.schedule(12);
    expect(s.trials).toHaveLength(24);
    expect(s.trials.filter((t) => t.cond === "base")).toHaveLength(16);
    for (const t of s.trials) expect(t.side === t.cue).toBe(t.cond === "base");
    const choices = s.trials.map((t) => t.side);
    const times = s.trials.map((t) => (t.cond === "cost" ? 500 : 350));
    expect(posner.score(s, { choices, times })).toMatchObject({ valid: true, secondary: { orientingCostMs: 150 } });
  });

  it("MOT: the picks are scored against the targets; duplicates and out-of-range dots are rejected", () => {
    const s = mot.schedule(4);
    expect(s.trials.map((t) => t.targets.length)).toEqual([2, 3, 4, 4]);
    const perfect = s.trials.map((t) => t.targets);
    expect(mot.score(s, { picks: perfect })).toMatchObject({ primary: 100, valid: true });
    expect(mot.score(s, { picks: s.trials.map(() => []) })!.primary).toBe(0);
    expect(mot.score(s, { picks: s.trials.map(() => [1, 1]) })).toBeNull();
    expect(mot.score(s, { picks: s.trials.map(() => [9]) })).toBeNull();
    expect(mot.score(s, { picks: [[0]] })).toBeNull();
  });
});

describe("new tests over the API (attention batch)", () => {
  it("start and finish work for posner and mot", async () => {
    const t = await newUser();
    for (const slug of ["posner", "mot"]) {
      const s = await call("POST", "/api/runs/start", t, { slug });
      expect(s.status, slug).toBe(201);
      vi.setSystemTime(Date.now() + 120000);
      const sc = s.json.schedule;
      const payload = slug === "posner"
        ? { choices: sc.trials.map((x: any) => x.side), times: sc.trials.map(() => 400) }
        : { picks: sc.trials.map((x: any) => x.targets) };
      const f = await call("POST", `/api/runs/${s.json.runId}/finish`, t, { payload });
      expect(f.status, slug).toBe(200);
      expect(f.json.valid, slug).toBe(true);
    }
  });
});
