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
