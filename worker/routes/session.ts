import { Hono } from "hono";
import { CITY_CODES } from "../../config/cities";
import { todayBaku } from "../../shared/experiments";
import { validateEmail, validateName } from "../../shared/profile";
import type { AppEnv } from "../env";
import { auth, deviceOf } from "../middleware/auth";
import { hashRecovery, newRecoveryCode, normalizeRecovery, randomNickname, signToken, verifyToken } from "../util";

export const LANGS = ["az", "ru"] as const;
const lang = (v: unknown) => ((LANGS as readonly string[]).includes(v as string) ? (v as string) : "az");
/** First-touch source tag from a link like ?s=video3 (letters, digits, - and _ only). */
const source = (v: unknown) => (typeof v === "string" && /^[a-z0-9_-]{1,40}$/i.test(v) ? v.toLowerCase() : null);

const USER_COLS = "id, nickname, city_code, email, email_consent, profile_done, lang";
const publicUser = (u: any) => ({
  id: u.id, nickname: u.nickname, city: u.city_code, email: u.email ?? null,
  emailConsent: !!u.email_consent, profileDone: !!u.profile_done, lang: u.lang,
});

export const sessionRoutes = new Hono<AppEnv>();

sessionRoutes.post("/session", async (c) => {
  const body = await c.req.json<{ token?: string; src?: string; lang?: string }>().catch(() => ({}) as any);
  const now = Date.now();
  const day = todayBaku(now);
  const db = c.env.DB;
  const existing = await verifyToken(c.env.SESSION_SECRET, body.token);
  if (existing) {
    const u = await db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).bind(existing).first<any>();
    if (u) {
      await db.batch([
        db.prepare("UPDATE users SET last_seen_at = ?, device_class = ? WHERE id = ?").bind(now, deviceOf(c), u.id),
        db.prepare("INSERT OR IGNORE INTO activity (user_id, day) VALUES (?,?)").bind(u.id, day),
      ]);
      return c.json({ user: publicUser(u), token: body.token });
    }
  }
  const id = crypto.randomUUID();
  const nickname = randomNickname();
  await db.batch([
    db.prepare("INSERT INTO users (id, nickname, device_class, created_at, last_seen_at, src, lang) VALUES (?,?,?,?,?,?,?)")
      .bind(id, nickname, deviceOf(c), now, now, source(body.src), lang(body.lang)),
    db.prepare("INSERT OR IGNORE INTO activity (user_id, day) VALUES (?,?)").bind(id, day),
  ]);
  const u = await db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).bind(id).first<any>();
  return c.json({ user: publicUser(u), token: await signToken(c.env.SESSION_SECRET, id) }, 201);
});

/**
 * Sign in on another device (or after clearing the browser) with the recovery code from the Passport.
 * An empty anonymous account that was just created on this device is dropped so it does not count twice.
 */
sessionRoutes.post("/session/restore", async (c) => {
  const b = await c.req.json<{ code?: string; token?: string }>().catch(() => ({}) as any);
  if (normalizeRecovery(b.code).length !== 12) return c.json({ error: "bad_code" }, 400);
  const db = c.env.DB;
  const hash = await hashRecovery(c.env.SESSION_SECRET, b.code);
  const u = await db.prepare(`SELECT ${USER_COLS} FROM users WHERE recovery_hash = ?`).bind(hash).first<any>();
  if (!u) return c.json({ error: "bad_code" }, 404);
  const old = await verifyToken(c.env.SESSION_SECRET, b.token);
  if (old && old !== u.id) {
    const runs = await db.prepare("SELECT COUNT(*) AS n FROM runs WHERE user_id = ?").bind(old).first<{ n: number }>();
    if (!runs?.n) await db.prepare("DELETE FROM users WHERE id = ?").bind(old).run();
  }
  await db.batch([
    db.prepare("UPDATE users SET last_seen_at = ?, device_class = ? WHERE id = ?").bind(Date.now(), deviceOf(c), u.id),
    db.prepare("INSERT OR IGNORE INTO activity (user_id, day) VALUES (?,?)").bind(u.id, todayBaku()),
  ]);
  return c.json({ user: publicUser(u), token: await signToken(c.env.SESSION_SECRET, u.id) });
});

export const meRoutes = new Hono<AppEnv>();
meRoutes.use("*", auth);

meRoutes.get("/me", async (c) => {
  const u = await c.env.DB.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).bind(c.get("userId")).first<any>();
  return c.json({ user: publicUser(u) });
});

/** Optional profile: display name, city, email (with consent), language. Everything is optional. */
meRoutes.patch("/me", async (c) => {
  const id = c.get("userId");
  const db = c.env.DB;
  const b = await c.req.json<any>().catch(() => ({}));
  const sets: string[] = [];
  const args: unknown[] = [];
  const add = (col: string, v: unknown) => { sets.push(`${col} = ?`); args.push(v); };

  if (b.nickname !== undefined) {
    const n = validateName(b.nickname);
    if (!n.ok) return c.json({ error: "bad_name", reason: n.reason }, 400);
    add("nickname", n.value);
  }
  if (b.rerollNickname) add("nickname", randomNickname());
  if (b.city !== undefined) {
    if (b.city !== null && !(CITY_CODES as readonly string[]).includes(b.city)) return c.json({ error: "bad_city" }, 400);
    add("city_code", b.city);
  }
  if (b.email !== undefined) {
    const e = validateEmail(b.email);
    if (!e.ok) return c.json({ error: "bad_email" }, 400);
    add("email", e.value);
    add("email_consent", e.value && b.emailConsent ? 1 : 0);
  }
  if (b.lang !== undefined) add("lang", lang(b.lang));
  if (b.profileDone === true) add("profile_done", 1);

  if (sets.length) await db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...args, id).run();
  const u = await db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).bind(id).first<any>();
  return c.json({ user: publicUser(u) });
});

/** Creates (or replaces) the recovery code. It is shown once; the previous code stops working. */
meRoutes.post("/me/recovery", async (c) => {
  const code = newRecoveryCode();
  await c.env.DB.prepare("UPDATE users SET recovery_hash = ? WHERE id = ?").bind(await hashRecovery(c.env.SESSION_SECRET, code), c.get("userId")).run();
  return c.json({ code });
});

/** "Məlumatlarımı sil": ON DELETE CASCADE removes runs, scores, activity, duel entries, daily, badges, anchors, shares. */
meRoutes.delete("/me", async (c) => {
  await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(c.get("userId")).run();
  return c.json({ ok: true });
});
