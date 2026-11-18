import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../worker/index";
import { aggregate } from "../worker/aggregate";
import { makeD1 } from "./d1shim";

let env: any;
const T0 = Date.parse("2026-11-16T10:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  env = { DB: makeD1(), SESSION_SECRET: "test-secret", SITE_ORIGIN: "https://beyin.test", ADMIN_TOKEN: "admin-secret-token" };
});
afterEach(() => vi.useRealTimers());

async function call(method: string, path: string, token?: string, body?: unknown, extra: Record<string, string> = {}) {
  const res = await app.request(
    path,
    {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), "user-agent": "Mozilla/5.0 (Android 14)", ...extra },
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
  it("builds percentiles from one best result per person (200 people needed)", async () => {
    const db: D1Database = env.DB;
    const now = Date.now();
    const stmts: D1PreparedStatement[] = [];
    for (let i = 0; i < 200; i++) {
      stmts.push(db.prepare("INSERT INTO users (id,nickname,device_class,created_at,last_seen_at) VALUES (?,?,?,?,?)").bind(`u${i}`, "x", "android", now, now));
      stmts.push(db.prepare("INSERT INTO runs (id,user_id,experiment_id,seed,status,primary_score,device_class,valid,created_at,finished_at) VALUES (?,?,1,1,'finished',?,'android',1,?,?)").bind(`r${i}`, `u${i}`, 200 + i, now, now));
    }
    // one heavy player with 50 extra runs must still count once
    for (let k = 0; k < 50; k++) {
      stmts.push(db.prepare("INSERT INTO runs (id,user_id,experiment_id,seed,status,primary_score,device_class,valid,created_at,finished_at) VALUES (?,?,1,1,'finished',?,'android',1,?,?)").bind(`x${k}`, "u0", 210 + k, now, now));
    }
    await db.batch(stmts);
    await aggregate(db, now);
    const p = await db.prepare("SELECT n FROM percentiles WHERE experiment_id = 1 AND device_class = 'android'").first<any>();
    expect(p.n).toBe(200);
    const t = await newUser();
    const { fin } = await play(t, [300, 250, 280, 400, 260]);
    expect(fin.json.percentile).toBeGreaterThan(0);
  });
});

describe("profile, Beyin balı and rankings", () => {
  it("name, city and email are optional, validated, and saved on the profile", async () => {
    const t = await newUser();
    expect((await call("GET", "/api/me", t)).json.user.profileDone).toBe(false);
    expect((await call("PATCH", "/api/me", t, { nickname: "x" })).status).toBe(400);
    expect((await call("PATCH", "/api/me", t, { nickname: "www.spam.az" })).json.reason).toBe("link");
    expect((await call("PATCH", "/api/me", t, { nickname: "Ali <b>" })).json.reason).toBe("chars");
    expect((await call("PATCH", "/api/me", t, { email: "not-an-email" })).status).toBe(400);
    const ok = await call("PATCH", "/api/me", t, { nickname: "  Əli   Məmmədov ", city: "gence", email: "Ali@Example.com", emailConsent: true, profileDone: true });
    expect(ok.json.user).toMatchObject({ nickname: "Əli Məmmədov", city: "gence", email: "ali@example.com", emailConsent: true, profileDone: true });
    // consent flag is dropped when the email is removed
    const cleared = await call("PATCH", "/api/me", t, { email: "" });
    expect(cleared.json.user).toMatchObject({ email: null, emailConsent: false });
  });
  it("each finished valid run updates the overall score; unplayed experiments count as 0", async () => {
    const t = await newUser();
    const r = await play(t, [230, 230, 231, 232, 233]); // ~85 points on Refleks
    expect(r.fin.json.points).toBeGreaterThanOrEqual(84);
    expect(r.fin.json.overall).toMatchObject({ played: 1, total: 6 });
    expect(r.fin.json.overall.score).toBe(Math.round(r.fin.json.points / 6));
    const p = await call("GET", "/api/me/passport", t);
    expect(p.json.overall).toMatchObject({ played: 1, rank: 1 });
    expect(p.json.experiments[0].best.points).toBe(r.fin.json.points);
  });
  it("invalid runs never reach the ranking", async () => {
    const t = await newUser();
    const r = await play(t, [50, 250, 280, 400, 260]); // < 100 ms: invalid
    expect(r.fin.json.valid).toBe(false);
    expect(r.fin.json.overall).toBeNull();
    expect((await call("GET", "/api/rankings/players", t)).json.players).toHaveLength(0);
  });
  it("a city shows up with just one player; players are ordered by score with my own rank", async () => {
    const [a, b, c] = [await newUser(), await newUser(), await newUser()];
    await call("PATCH", "/api/me", a, { nickname: "Aydın", city: "baki" });
    await call("PATCH", "/api/me", b, { nickname: "Bəxtiyar", city: "baki" });
    await call("PATCH", "/api/me", c, { nickname: "Cavid", city: "seki" });
    await play(a, [240, 250, 245, 260, 255]);
    await play(b, [330, 340, 350, 360, 370]);
    await play(c, [235, 236, 237, 238, 239]);
    const cities = (await call("GET", "/api/rankings/cities", a)).json.cities;
    expect(cities.map((x: any) => [x.city, x.players])).toEqual([["seki", 1], ["baki", 2]]);
    const all = (await call("GET", "/api/rankings/players", b)).json;
    expect(all.players.map((p: any) => p.nickname)).toEqual(["Cavid", "Aydın", "Bəxtiyar"]);
    expect(all.players[2].isMe).toBe(true);
    expect(all.me.rank).toBe(3);
    const baki = (await call("GET", "/api/rankings/players?city=baki", b)).json;
    expect(baki.players.map((p: any) => p.nickname)).toEqual(["Aydın", "Bəxtiyar"]);
    expect(baki.me.rank).toBe(2);
  });
  it("deleting my data removes the email and the score", async () => {
    const t = await newUser();
    await call("PATCH", "/api/me", t, { email: "gone@example.com" });
    await play(t, [240, 250, 245, 260, 255]);
    await call("DELETE", "/api/me", t);
    for (const table of ["users", "user_scores", "activity"]) {
      expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n).toBe(0);
    }
  });
  it("source tag and language are stored on first contact; activity is logged once per day", async () => {
    const res = await call("POST", "/api/session", undefined, { src: "Video3", lang: "ru" });
    const id = res.json.user.id;
    expect(res.json.user.lang).toBe("ru");
    await call("POST", "/api/session", undefined, { token: res.json.token, src: "other" });
    const u = await env.DB.prepare("SELECT src FROM users WHERE id = ?").bind(id).first();
    expect(u.src).toBe("video3");
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM activity WHERE user_id = ?").bind(id).first()).n).toBe(1);
    expect((await call("POST", "/api/session", undefined, { src: "bad src!" })).status).toBe(201);
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

describe("memory + illusions over the API", () => {
  it("yaddas-zenciri: server replays the attempts, duel compares chain length", async () => {
    const [a, b] = [await newUser(), await newUser()];
    async function run(tok: string, reach: number, code?: string) {
      const s = await call("POST", "/api/runs/start", tok, { slug: "yaddas-zenciri", ...(code ? { duelCode: code } : {}) });
      const seqs = s.json.schedule.seqs as number[][][];
      const attempts: { taps: number[]; ms: number }[] = [];
      for (let len = 3; len <= reach; len++) attempts.push({ taps: seqs[len - 3][0], ms: len * 500 });
      const fail = (reach + 1 - 3) < seqs.length;
      if (fail) {
        const w = seqs[reach + 1 - 3];
        attempts.push({ taps: [(w[0][0] + 1) % 9], ms: 500 }, { taps: [(w[1][0] + 1) % 9], ms: 500 });
      }
      vi.setSystemTime(Date.now() + 30000);
      return { s: s.json, f: await call("POST", `/api/runs/${s.json.runId}/finish`, tok, { payload: { attempts } }) };
    }
    const ra = await run(a, 7);
    expect(ra.f.json).toMatchObject({ primary: 7, valid: true, level: 3 });
    const { code } = (await call("POST", "/api/duels", a, { runId: ra.s.runId })).json;
    await run(b, 5, code);
    const res = await call("GET", `/api/duels/${code}/result`, b);
    expect(res.json.outcome).toBe("lose");
  });
  it("eyni-rengdir: errors counted server-side", async () => {
    const t = await newUser();
    const s = await call("POST", "/api/runs/start", t, { slug: "eyni-rengdir" });
    vi.setSystemTime(Date.now() + 30000);
    const f = await call("POST", `/api/runs/${s.json.runId}/finish`, t, { payload: { answers: [false, true, false], times: [900, 800, 700] } });
    expect(f.json).toMatchObject({ primary: 2, level: 2, valid: true });
  });
});

describe("yalanci-yaddas + lovber over the API", () => {
  it("yalanci: client never receives the probe kinds; server scores it", async () => {
    const t = await newUser();
    const s = await call("POST", "/api/runs/start", t, { slug: "yalanci-yaddas" });
    expect(s.json.schedule.probe.every((p: unknown) => typeof p === "string")).toBe(true);
    expect(JSON.stringify(s.json.schedule)).not.toContain("lure");
    vi.setSystemTime(Date.now() + 60000);
    const answers = [true, false, true, false, true, false, true, false, true, false, true, false];
    const f = await call("POST", `/api/runs/${s.json.runId}/finish`, t, { payload: { answers, times: answers.map((_, i) => 700 + i) } });
    expect(f.status).toBe(200);
    expect(f.json.primary).toBeGreaterThanOrEqual(0);
    expect(f.json.secondary.setIndex).toBe(0);
  });
  it("lovber: stores the first answer per question, collective result needs 100 per group", async () => {
    const t = await newUser();
    const s = await call("POST", "/api/runs/start", t, { slug: "lovber" });
    const { anchor, questionId } = s.json.schedule;
    expect(JSON.stringify(s.json.schedule)).not.toContain("1025");
    vi.setSystemTime(Date.now() + 10000);
    const f = await call("POST", `/api/runs/${s.json.runId}/finish`, t, { payload: { answer: 1500, higher: true } });
    expect(f.json).toMatchObject({ primary: 475, level: null, valid: true });
    const row = await env.DB.prepare("SELECT anchor_value, answer FROM anchor_assignments").first();
    expect(row).toMatchObject({ anchor_value: anchor, answer: 1500 });

    expect((await call("GET", `/api/lovber/stats?question=${questionId}`, t)).json.ready).toBe(false);
    const now = Date.now();
    const stmts: D1PreparedStatement[] = [];
    for (let i = 0; i < 100; i++) for (const [k, a, ans] of [["lo", 200, 400], ["hi", 2000, 1600]] as const) {
      const id = `${k}${i}`;
      stmts.push(env.DB.prepare("INSERT INTO users (id,nickname,device_class,created_at,last_seen_at) VALUES (?,?,?,?,?)").bind(id, "x", "other", now, now));
      stmts.push(env.DB.prepare("INSERT INTO anchor_assignments (user_id,question_id,anchor_value,answer,created_at) VALUES (?,?,?,?,?)").bind(id, questionId, a, ans, now));
    }
    await env.DB.batch(stmts);
    const st = await call("GET", `/api/lovber/stats?question=${questionId}`, t);
    // the first user's own answer (1500) lands in whichever group their random anchor put them in
    expect(st.json.ready).toBe(true);
    expect(st.json.low).toBeGreaterThanOrEqual(400);
    expect(st.json.low).toBeLessThan(st.json.high);
    expect(st.json.high).toBeLessThanOrEqual(1600);
  });
});

import { awardBadges } from "../worker/badges";

describe("daily, badges, my duels", () => {
  it("daily day rolls over at Baku midnight (UTC+4)", async () => {
    const t = await newUser();
    vi.setSystemTime(Date.parse("2026-11-16T21:00:00Z")); // 01:00 on the 17th in Baku
    const d = await call("GET", "/api/daily", t);
    expect(d.json).toMatchObject({ date: "2026-11-17", slug: "reng-ve-soz", done: false, streak: 0, weekly: false });
    expect(d.json.week).toHaveLength(7);
    expect(d.json.week[0].date).toBe("2026-11-16");
  });
  it("sunday is the weekly duel", async () => {
    const t = await newUser();
    vi.setSystemTime(Date.parse("2026-11-22T08:00:00Z"));
    expect((await call("GET", "/api/daily", t)).json.weekly).toBe(true);
  });
  it("first duel badge for both players once the duel is completed; /me/duels lists it", async () => {
    const [alice, bob] = [await newUser(), await newUser()];
    const a = await play(alice, [240, 250, 245, 260, 255]);
    expect(a.fin.json.badges).toEqual([]); // alone: no completed duel yet
    const { code } = (await call("POST", "/api/duels", alice, { runId: a.start.runId })).json;
    const open = await call("GET", "/api/me/duels", alice);
    expect(open.json.duels[0]).toMatchObject({ code, slug: "refleks", status: "open", finished: 1, myRank: null });
    const b = await play(bob, [300, 310, 290, 320, 305], { duelCode: code });
    expect(b.fin.json.badges).toEqual(["first_duel"]);
    expect((await call("GET", "/api/me/passport", alice)).json.badges).toEqual(["first_duel"]);
    const done = await call("GET", "/api/me/duels", bob);
    expect(done.json.duels[0]).toMatchObject({ status: "closed", finished: 2, myRank: 2 });
  });
  it("group leader needs a group of three or more and a clear first place", async () => {
    const [alice, bob, carol] = [await newUser(), await newUser(), await newUser()];
    const a = await play(alice, [200, 210, 205, 220, 215]);
    const { code } = (await call("POST", "/api/duels", alice, { runId: a.start.runId, type: "group" })).json;
    await play(bob, [300, 310, 290, 320, 305], { duelCode: code });
    expect((await call("GET", "/api/me/passport", alice)).json.badges).toEqual(["first_duel"]);
    await play(carol, [330, 340, 350, 360, 370], { duelCode: code });
    expect((await call("GET", "/api/me/passport", alice)).json.badges.sort()).toEqual(["first_duel", "group_leader"]);
  });
  it("streak7 and all_six rules", async () => {
    const t = await newUser();
    const uid = t.split(".")[0];
    const db: D1Database = env.DB;
    const now = Date.now();
    const stmts: D1PreparedStatement[] = [];
    for (let e = 1; e <= 6; e++) {
      stmts.push(db.prepare("INSERT INTO runs (id,user_id,experiment_id,seed,status,primary_score,valid,device_class,created_at,finished_at) VALUES (?,?,?,1,'finished',1,1,'other',?,?)").bind(`rr${e}`, uid, e, now, now));
    }
    for (let d = 10; d <= 16; d++) {
      stmts.push(db.prepare("INSERT INTO daily (user_id,date,run_id) VALUES (?,?,?)").bind(uid, `2026-11-${d}`, `rr${d % 6 + 1}`));
    }
    await db.batch(stmts);
    expect((await awardBadges(db, uid, "2026-11-16")).sort()).toEqual(["all_six", "streak7"]);
    expect(await awardBadges(db, uid, "2026-11-16")).toEqual([]); // already earned
  });
});

describe("admin analytics and moderation", () => {
  const adm = { "x-admin-token": "admin-secret-token" };
  it("is closed without the token, and disabled when no token is configured", async () => {
    expect((await call("GET", "/api/admin/stats")).status).toBe(401);
    expect((await call("GET", "/api/admin/stats", undefined, undefined, { "x-admin-token": "wrong" })).status).toBe(401);
    env.ADMIN_TOKEN = undefined;
    expect((await call("GET", "/api/admin/stats", undefined, undefined, adm)).status).toBe(404);
  });
  it("counts visitors, funnel, sources, retention-ready cohorts and audience", async () => {
    const a = (await call("POST", "/api/session", undefined, { src: "video1", lang: "az" })).json.token as string;
    const b = (await call("POST", "/api/session", undefined, { src: "video1", lang: "ru" })).json.token as string;
    await call("POST", "/api/session", undefined, {}); // a third visitor who never plays
    await call("PATCH", "/api/me", a, { city: "baki", email: "a@b.az", emailConsent: true, profileDone: true });
    const r = await play(a, [240, 250, 245, 260, 255]);
    await call("POST", "/api/shares", a, { runId: r.start.runId, channel: "whatsapp" });
    const { code } = (await call("POST", "/api/duels", a, { runId: r.start.runId })).json;
    await play(b, [300, 310, 290, 320, 305], { duelCode: code });
    const s = (await call("GET", "/api/admin/stats", undefined, undefined, adm)).json;
    expect(s.totals).toMatchObject({ users: 3, dau: 3, wau: 3, mau: 3, playsLast30: 2 });
    expect(s.funnel).toMatchObject({ visited: 3, started: 2, finished: 2, shared: 1, invited: 1, friendsFinished: 1 });
    expect(s.monthly.at(-1)).toMatchObject({ month: "2026-11", n: 3 });
    expect(s.audience.sources.find((x: any) => x.k === "video1").n).toBe(2);
    expect(s.audience.sources.find((x: any) => x.k === "(direct)").n).toBe(1);
    expect(s.audience.langs.map((x: any) => x.k).sort()).toEqual(["az", "ru"]);
    expect(s.audience.cities[0]).toMatchObject({ k: "baki", n: 1 });
    expect(s.audience.consentedEmails).toBe(1);
    expect(s.experiments.find((e: any) => e.slug === "refleks").plays).toBe(2);
    expect(s.retention.d7).toHaveProperty("rate");
  });
  it("lists only consented emails and can reset a name", async () => {
    const a = (await call("POST", "/api/session")).json;
    const b = (await call("POST", "/api/session")).json;
    await call("PATCH", "/api/me", a.token, { email: "yes@x.az", emailConsent: true, nickname: "Mehman", profileDone: true });
    await call("PATCH", "/api/me", b.token, { email: "no@x.az", emailConsent: false });
    const em = (await call("GET", "/api/admin/emails", undefined, undefined, adm)).json.emails;
    expect(em.map((e: any) => e.email)).toEqual(["yes@x.az"]);
    const names = (await call("GET", "/api/admin/names", undefined, undefined, adm)).json.users;
    expect(names[0].nickname).toBe("Mehman");
    const rs = await call("POST", `/api/admin/users/${a.user.id}/reset-name`, undefined, undefined, adm);
    expect(rs.json.ok).toBe(true);
    expect((await call("GET", "/api/me", a.token)).json.user.nickname).not.toBe("Mehman");
  });
});

describe("Russian word sets", () => {
  it("Yalançı yaddaş uses the word list of the player's language, and a duel keeps its creator's language", async () => {
    const [ru, az] = [await newUser(), await newUser()];
    const s = await call("POST", "/api/runs/start", ru, { slug: "yalanci-yaddas", lang: "ru" });
    expect(s.json.schedule.study.every((w: string) => /[а-яё]/.test(w))).toBe(true);
    vi.setSystemTime(Date.now() + 60000);
    const answers = [true, false, true, false, true, false, true, false, true, false, true, false];
    const f = await call("POST", `/api/runs/${s.json.runId}/finish`, ru, { payload: { answers, times: answers.map((_, i) => 700 + i) } });
    expect(f.status).toBe(200);
    expect(f.json.secondary.setIndex).toBe(1); // the Russian set
    const { code } = (await call("POST", "/api/duels", ru, { runId: s.json.runId })).json;
    // the friend's own language is az, but the duel is Russian: same words for both players
    const fr = await call("POST", "/api/runs/start", az, { slug: "yalanci-yaddas", lang: "az", duelCode: code });
    expect(fr.json.schedule).toEqual(s.json.schedule);
    // a normal Azerbaijani run still gets Azerbaijani words
    const z = await call("POST", "/api/runs/start", az, { slug: "yalanci-yaddas", lang: "az" });
    expect(z.json.schedule.study.every((w: string) => /^[a-zəıöüçşğ]+$/i.test(w))).toBe(true);
  });
});
