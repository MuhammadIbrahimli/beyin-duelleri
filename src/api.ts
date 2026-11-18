import { getLang } from "./i18n";

const KEY = "bd_token";

export interface User {
  id: string; nickname: string; city: string | null; email: string | null;
  emailConsent: boolean; profileDone: boolean; lang: string;
}
let user: User | null = null;
let ready: Promise<User> | null = null;

/** First-touch source tag: a link like /?s=video3 (or utm_source) is remembered once and sent with the first session. */
function sourceTag(): string | null {
  const q = new URLSearchParams(location.search);
  const s = q.get("s") ?? q.get("utm_source");
  if (s && /^[a-z0-9_-]{1,40}$/i.test(s) && !localStorage.getItem("bd_src")) localStorage.setItem("bd_src", s);
  return localStorage.getItem("bd_src");
}

async function raw(method: string, path: string, body?: unknown, token?: string | null) {
  const res = await fetch("/api" + path, {
    method,
    headers: { "content-type": "application/json", "x-client-version": "1", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error ?? "error"), { status: res.status, code: json.error, reason: json.reason });
  return json;
}

export function session(): Promise<User> {
  ready ??= raw("POST", "/session", { token: localStorage.getItem(KEY), src: sourceTag(), lang: getLang() }).then((r) => {
    localStorage.setItem(KEY, r.token);
    user = r.user;
    return r.user as User;
  });
  return ready;
}
export const me = () => user;
export const setMe = (u: User) => { user = u; };

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  await session();
  try {
    return await raw(method, path, body, localStorage.getItem(KEY));
  } catch (e: any) {
    if (e.status === 401) { // token no longer valid (e.g. data deleted): start a fresh anonymous session once
      localStorage.removeItem(KEY);
      ready = null;
      await session();
      return raw(method, path, body, localStorage.getItem(KEY));
    }
    throw e;
  }
}

/** Saves profile fields and keeps the cached user in sync. */
export async function saveProfile(patch: Record<string, unknown>): Promise<User> {
  const r = await api<{ user: User }>("PATCH", "/me", patch);
  user = r.user;
  return r.user;
}

export interface FinishResult {
  runId: string; slug: string; primary: number; secondary: Record<string, number>;
  valid: boolean; invalidReason: string | null; level: 1 | 2 | 3 | 4 | null; percentile: number | null;
  duel: { code: string } | null; badges: string[]; points: number;
  overall: { score: number; played: number; total: number } | null;
}
