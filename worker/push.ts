import { todayBaku } from "../shared/experiments";
import { dayAdd } from "../shared/streak";
import type { Env } from "./env";
import { b64url } from "./util";

/** Push services we accept. The endpoint comes from the browser, so it must never point at an arbitrary host. */
const ALLOWED_HOST = /(^|\.)(googleapis\.com|mozilla\.com|push\.apple\.com|notify\.windows\.com)$/;
export function validEndpoint(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 600) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && ALLOWED_HOST.test(u.hostname) ? u.toString() : null;
  } catch { return null; }
}

const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const textB64 = (s: string) => b64url(new TextEncoder().encode(s).buffer as ArrayBuffer);
const bytesB64 = (u: Uint8Array) => b64url(u.slice().buffer as ArrayBuffer);

export const pushConfigured = (env: Env) => !!(env.VAPID_PRIVATE && env.VAPID_PUBLIC && (env.VAPID_SUBJECT || env.SITE_ORIGIN));

/** VAPID (RFC 8292) Authorization header: an ES256 JWT for the push service plus our public key. */
export async function vapidHeader(env: Env, endpoint: string, now = Date.now()): Promise<string> {
  const pub = fromB64url(env.VAPID_PUBLIC!); // 0x04 || X || Y
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", d: env.VAPID_PRIVATE!, x: bytesB64(pub.slice(1, 33)), y: bytesB64(pub.slice(33, 65)), ext: true },
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
  const claims = { aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || env.SITE_ORIGIN };
  const input = `${textB64(JSON.stringify({ typ: "JWT", alg: "ES256" }))}.${textB64(JSON.stringify(claims))}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(input));
  return `vapid t=${input}.${b64url(sig)}, k=${env.VAPID_PUBLIC}`;
}

/** Empty push: the service worker picks the text (in the saved language), so nothing personal travels through the push service. */
export async function sendPush(env: Env, endpoint: string): Promise<number> {
  const res = await fetch(endpoint, { method: "POST", headers: { authorization: await vapidHeader(env, endpoint), TTL: "43200", Urgency: "normal" } });
  return res.status;
}

/** Baku evening window for reminders. The cron is hourly and each run sends at most BATCH, so a backlog drains over the window. */
export const REMINDER_HOURS = [19, 20, 21];
const BATCH = 40; // stays under the free plan's subrequest limit

export async function sendStreakReminders(env: Env, now = Date.now()): Promise<{ sent: number; removed: number }> {
  const hour = Math.floor(((now + 4 * 3600000) % 86400000) / 3600000); // Baku = UTC+4
  if (!REMINDER_HOURS.includes(hour) || !pushConfigured(env)) return { sent: 0, removed: 0 };
  const today = todayBaku(now);
  const yesterday = dayAdd(today, -1);
  // "streak at risk": played the daily test yesterday, not yet today, not reminded today
  const { results } = await env.DB.prepare(
    `SELECT p.endpoint FROM push_subs p
     WHERE (p.last_sent_day IS NULL OR p.last_sent_day <> ?)
       AND EXISTS (SELECT 1 FROM daily d WHERE d.user_id = p.user_id AND d.date = ?)
       AND NOT EXISTS (SELECT 1 FROM daily d WHERE d.user_id = p.user_id AND d.date = ?)
     LIMIT ${BATCH}`,
  ).bind(today, yesterday, today).all<{ endpoint: string }>();

  const ops: D1PreparedStatement[] = [];
  let sent = 0, removed = 0;
  for (const { endpoint } of results) {
    let status = 0;
    try { status = await sendPush(env, endpoint); } catch { status = 0; }
    if (status === 404 || status === 410) {
      removed++;
      ops.push(env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ?").bind(endpoint));
    } else {
      if (status >= 200 && status < 300) sent++;
      ops.push(env.DB.prepare("UPDATE push_subs SET last_sent_day = ? WHERE endpoint = ?").bind(today, endpoint));
    }
  }
  if (ops.length) await env.DB.batch(ops);
  return { sent, removed };
}
