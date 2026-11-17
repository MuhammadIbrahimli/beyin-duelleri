import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../worker/index";
import { aggregate } from "../worker/aggregate";
import { makeD1 } from "./d1shim";

let env: any;
const T0 = Date.parse("2026-11-16T10:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  env = { DB: makeD1(), SESSION_SECRET: "test-secret", SITE_ORIGIN: "https://beyin.test" };
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

/** start + wait out the schedule + finish with given reaction times */
async function play(token: string, times: number[], opts: { duelCode?: string; daily?: boolean; early?: number } = {}) {
  const start = await call("POST", "/api/runs/start", token, { slug: "refleks", ...opts });
  expect(start.status).toBe(201);
  vi.setSystemTime(Date.now() + 40000);
  const fin = await call("POST", `/api/runs/${start.json.runId}/finish`, token, { payload: { times, earlyTaps: opts.early ?? 0 } });
  return { start: start.json, fin };
}

describe("session", () => {
  it("creates an anonymous user with an adjective+animal nickname and restores it by token", async () => {
    const a = await call("POST", "/api/session");
    expect(a.status).toBe(201);
    expect(a.json.user.nickname).toMatch(/^\S+ \S+$/);
    const b = await call("POST", "/api/session", undefined, { token: a.json.token });
    expect(b.status).toBe(200);
    expect(b.json.user.id).toBe(a.json.user.id);
  });
  it("rejects forged tokens and missing auth", async () => {
    expect((await call("GET", "/api/experiments")).status).toBe(401);
    expect((await call("GET", "/api/experiments", "abc.def")).status).toBe(401);
    const t = await newUser();
    expect((await call("GET", "/api/experiments", t + "x")).status).toBe(401);
  });
  it("validates city and rerolls nickname", async () => {
    const t = await newUser();
    expect((await call("PATCH", "/api/me", t, { city: "mars" })).status).toBe(400);
    expect((await call("PATCH", "/api/me", t, { city: "baki" })).json.user.city).toBe("baki");
    expect((await call("PATCH", "/api/me", t, { rerollNickname: true })).status).toBe(200);
  });
});

describe("runs", () => {
  it("server issues the seed and schedule; result is computed server-side", async () => {
    const t = await newUser();
    const { start, fin } = await play(t, [300, 250, 280, 400, 260], { early: 1 });
    expect(start.schedule.delays).toHaveLength(5);
    expect(fin.json).toMatchObject({ primary: 280, valid: true, level: 2, percentile: null });
  });
  it("marks impossible reactions invalid and refuses double finish", async () => {
    const t = await newUser();
    const { start, fin } = await play(t, [50, 250, 280, 400, 260]);
    expect(fin.json.valid).toBe(false);
    expect(fin.json.invalidReason).toBe("too_fast");
    const again = await call("POST", `/api/runs/${start.runId}/finish`, t, { payload: { times: [300, 300, 301, 302, 303] } });
    expect(again.status).toBe(409);
  });
  it("flags a run finished faster than the schedule allows", async () => {
    const t = await newUser();
    const s = await call("POST", "/api/runs/start", t, { slug: "refleks" });
    const f = await call("POST", `/api/runs/${s.json.runId}/finish`, t, { payload: { times: [300, 250, 280, 400, 260] } });
    expect(f.json.valid).toBe(false);
    expect(f.json.invalidReason).toBe("too_quick");
  });
  it("flags rapid series (>=4 finished runs in a minute)", async () => {
    const t = await newUser();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await call("POST", "/api/runs/start", t, { slug: "refleks" })).json.runId);
    vi.setSystemTime(Date.now() + 40000);
    const out = [];
    for (const id of ids) out.push((await call("POST", `/api/runs/${id}/finish`, t, { payload: { times: [300, 250, 280, 400, 260 + out.length] } })).json.valid);
    expect(out).toEqual([true, true, true, true, false]);
  });
  it("daily run uses the same seed for everyone and counts toward the streak", async () => {
    const a = await newUser(), b = await newUser();
    const ra = await play(a, [300, 250, 280, 400, 260], { daily: true });
    const rb = await play(b, [310, 250, 280, 400, 260], { daily: true });
    expect(ra.start.seed).toBe(rb.start.seed);
    const p = await call("GET", "/api/me/passport", a);
    expect(p.json.streak).toBe(1);
    expect((await call("GET", "/api/experiments", a)).json.daily.done).toBe(true);
  });
});

describe("duels", () => {
  it("full cycle: creator hidden until friend finishes, same seed, winner decided", async () => {
    const alice = await newUser(), bob = await newUser();
    const a = await play(alice, [240, 250, 245, 260, 255]);
    const duel = await call("POST", "/api/duels", alice, { runId: a.start.runId });
    expect(duel.status).toBe(201);
    expect(duel.json.url).toBe(`https://beyin.test/d/${duel.json.code}`);

    const info = await call("GET", `/api/duels/${duel.json.code}`, bob);
    expect(info.json.status).toBe("open");
    expect(JSON.stringify(info.json)).not.toContain("primary");
    expect((await call("GET", `/api/duels/${duel.json.code}/result`, bob)).status).toBe(403);

    const b = await play(bob, [300, 310, 290, 320, 305], { duelCode: duel.json.code });
    expect(b.start.seed).toBe(a.start.seed);
    expect(b.start.schedule).toEqual(a.start.schedule);

    const resB = await call("GET", `/api/duels/${duel.json.code}/result`, bob);
    expect(resB.json.outcome).toBe("lose");
    expect(resB.json.entries.map((e: any) => e.primary)).toEqual([250, 305]);
    const resA = await call("GET", `/api/duels/${duel.json.code}/result`, alice);
    expect(resA.json.outcome).toBe("win");
  });
  it("1v1 closes after the first friend, creator cannot join own duel", async () => {
    const [alice, bob, carol] = [await newUser(), await newUser(), await newUser()];
    const a = await play(alice, [240, 250, 245, 260, 255]);
    const { code } = (await call("POST", "/api/duels", alice, { runId: a.start.runId })).json;
    expect((await call("POST", "/api/runs/start", alice, { slug: "refleks", duelCode: code })).status).toBe(409);
    await play(bob, [300, 310, 290, 320, 305], { duelCode: code });
    expect((await call("POST", "/api/runs/start", carol, { slug: "refleks", duelCode: code })).status).toBe(409);
    expect((await call("GET", `/api/duels/${code}`, carol)).json.status).toBe("closed");
  });
  it("group duel takes up to 10 players", async () => {
    const alice = await newUser();
    const a = await play(alice, [240, 250, 245, 260, 255]);
    const { code } = (await call("POST", "/api/duels", alice, { runId: a.start.runId, type: "group" })).json;
    for (let i = 0; i < 9; i++) {
      const u = await newUser();
      expect((await play(u, [300 + i, 310, 290, 320, 305], { duelCode: code })).fin.status).toBe(200);
    }
    const late = await newUser();
    expect((await call("POST", "/api/runs/start", late, { slug: "refleks", duelCode: code })).status).toBe(409);
    const res = await call("GET", `/api/duels/${code}/result`, alice);
    expect(res.json.entries).toHaveLength(10);
    expect(res.json.entries[0].rank).toBe(1);
  });
  it("link expires after 7 days; invalid runs cannot start duels", async () => {
    const alice = await newUser(), bob = await newUser();
    const bad = await play(alice, [50, 250, 280, 400, 260]);
    expect((await call("POST", "/api/duels", alice, { runId: bad.start.runId })).status).toBe(400);
    const a = await play(alice, [240, 250, 245, 260, 255]);
    const { code } = (await call("POST", "/api/duels", alice, { runId: a.start.runId })).json;
    vi.setSystemTime(Date.now() + 7 * 86400000 + 1000);
    expect((await call("GET", `/api/duels/${code}`, bob)).json.status).toBe("expired");
    expect((await call("POST", "/api/runs/start", bob, { slug: "refleks", duelCode: code })).status).toBe(410);
  });
});

describe("privacy", () => {
  it("DELETE /me removes the user's data and the token stops working", async () => {
    const alice = await newUser();
    const a = await play(alice, [240, 250, 245, 260, 255], { daily: true });
    await call("POST", "/api/duels", alice, { runId: a.start.runId });
    expect((await call("DELETE", "/api/me", alice)).status).toBe(200);
    for (const table of ["users", "runs", "duels", "duel_entries", "daily"]) {
      const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first();
      expect(row.n).toBe(0);
    }
    expect((await call("GET", "/api/experiments", alice)).status).toBe(401);
  });
});

describe("aggregate (cron)", () => {
  it("builds city stats only for cities with >= 30 participants and percentiles from 200 runs", async () => {
    const db: D1Database = env.DB;
    const now = Date.now();
    const stmts: D1PreparedStatement[] = [];
    const city = (i: number) => (i < 30 ? "baki" : i < 59 ? "gence" : null);
    for (let i = 0; i < 200; i++) {
      stmts.push(db.prepare("INSERT INTO users (id,nickname,city_code,device_class,created_at,last_seen_at) VALUES (?,?,?,?,?,?)").bind(`u${i}`, "x", city(i), "android", now, now));
      stmts.push(db.prepare("INSERT INTO runs (id,user_id,experiment_id,seed,status,primary_score,device_class,valid,created_at,finished_at) VALUES (?,?,1,1,'finished',?,'android',1,?,?)").bind(`r${i}`, `u${i}`, 200 + i, now, now));
    }
    await db.batch(stmts);
    await aggregate(db, now);
    const { results } = await db.prepare("SELECT city_code, n, median FROM city_stats WHERE experiment_id = 1 ORDER BY city_code").all<any>();
    expect(results.map((r: any) => [r.city_code, r.n])).toEqual([["baki", 30], ["diger", 170]]);
    const p = await db.prepare("SELECT n FROM percentiles WHERE experiment_id = 1 AND device_class = 'android'").first<any>();
    expect(p.n).toBe(200);

    const t = await newUser();
    const { fin } = await play(t, [300, 250, 280, 400, 260]);
    expect(fin.json.percentile).toBeGreaterThan(0);

    const r = await call("GET", "/api/rankings/cities?experiment=refleks", t);
    expect(r.json.cities.map((c: any) => c.city)).toEqual(["baki", "diger"]);
  });
});

describe("reng-ve-soz over the API", () => {
  async function playReng(token: string, ms: number, duelCode?: string) {
    const s = await call("POST", "/api/runs/start", token, { slug: "reng-ve-soz", ...(duelCode ? { duelCode } : {}) });
    expect(s.status).toBe(201);
    const trials = s.json.schedule.trials as { ink: number; congruent: boolean }[];
    vi.setSystemTime(Date.now() + 30000);
    const f = await call("POST", `/api/runs/${s.json.runId}/finish`, token, {
      payload: { answers: trials.map((t) => t.ink), times: trials.map((t, i) => (t.congruent ? ms - 100 : ms) + i) },
    });
    return { s: s.json, f };
  }
  it("duel: lower focus score wins, same trial order for both", async () => {
    const [a, b] = [await newUser(), await newUser()];
    const ra = await playReng(a, 600);
    expect(ra.f.json.valid).toBe(true);
    const { code } = (await call("POST", "/api/duels", a, { runId: ra.s.runId })).json;
    const rb = await playReng(b, 900, code);
    expect(rb.s.schedule).toEqual(ra.s.schedule);
    const res = await call("GET", `/api/duels/${code}/result`, b);
    expect(res.json.outcome).toBe("lose");
    expect(res.json.entries[0].secondary.errors).toBe(0);
  });
});
