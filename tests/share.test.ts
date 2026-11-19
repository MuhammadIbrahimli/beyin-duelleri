import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker, { app } from "../worker/index";
import { makeD1 } from "./d1shim";

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

/** The Worker entry point: API calls go to the app, invite links get a preview page. */
async function page(path: string) {
  const res = await worker.fetch(new Request(`https://beyin.test${path}`), env, {} as any);
  return { status: res.status, type: res.headers.get("content-type"), html: await res.text() };
}

describe("share previews for invite links", () => {
  it("a duel link carries the caller's name and points in its title and description", async () => {
    const t = (await call("POST", "/api/session", undefined, { lang: "az" })).json.token as string;
    await call("PATCH", "/api/me", t, { nickname: "Əli Test" });
    const s = await call("POST", "/api/runs/start", t, { slug: "refleks" });
    vi.setSystemTime(Date.now() + 40000);
    await call("POST", `/api/runs/${s.json.runId}/finish`, t, { payload: { times: [250, 260, 255, 270, 245], earlyTaps: 0 } });
    const { code } = (await call("POST", "/api/duels", t, { runId: s.json.runId })).json;

    const p = await page(`/d/${code}`);
    expect(p.status).toBe(200);
    expect(p.type).toContain("text/html");
    expect(p.html).toContain("<title>Əli Test səni dueldə çağırır</title>");
    expect(p.html).toContain('property="og:title" content="Əli Test səni dueldə çağırır"');
    expect(p.html).toMatch(/Beyin balı \d+/);
    expect(p.html).toContain(`property="og:url" content="https://beyin.test/d/${code}"`);
    expect(p.html).toContain('property="og:image" content="https://beyin.test/icon-512.png"');
  });

  it("a group link carries the group name and its size", async () => {
    const t = (await call("POST", "/api/session")).json.token as string;
    const g = (await call("POST", "/api/groups", t, { name: "Dövlət 2-ci kurs" })).json;
    const p = await page(`/g/${g.code}`);
    expect(p.html).toContain("<title>Dövlət 2-ci kurs — Beyin duelləri</title>");
    expect(p.html).toContain("1 nəfər artıq qoşulub");
  });

  it("an unknown or odd code gets the generic page, and names are escaped", async () => {
    const p = await page("/d/ABCDEF12");
    expect(p.status).toBe(200);
    expect(p.html).toContain("<title>Beyin duelləri</title>");
    // names with markup are refused by the name rules, so no raw markup can reach a preview
    const t = (await call("POST", "/api/session")).json.token as string;
    const bad = await call("POST", "/api/groups", t, { name: "<b>x</b>" });
    expect(bad.status).toBe(400);
  });

  it("API routes still reach the API, not the preview", async () => {
    const res = await worker.fetch(new Request("https://beyin.test/api/experiments"), env, {} as any);
    expect(res.status).toBe(401);
  });
});
