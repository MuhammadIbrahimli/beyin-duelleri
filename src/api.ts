const KEY = "bd_token";

export interface User { id: string; nickname: string; city: string | null }
let user: User | null = null;
let ready: Promise<User> | null = null;

async function raw(method: string, path: string, body?: unknown, token?: string | null) {
  const res = await fetch("/api" + path, {
    method,
    headers: { "content-type": "application/json", "x-client-version": "1", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error ?? "error"), { status: res.status, code: json.error });
  return json;
}

export function session(): Promise<User> {
  ready ??= raw("POST", "/session", { token: localStorage.getItem(KEY) }).then((r) => {
    localStorage.setItem(KEY, r.token);
    user = r.user;
    return r.user as User;
  });
  return ready;
}
export const me = () => user;

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

export interface FinishResult {
  runId: string; slug: string; primary: number; secondary: Record<string, number>;
  valid: boolean; invalidReason: string | null; level: 1 | 2 | 3 | 4 | null; percentile: number | null;
  duel: { code: string } | null;
}
