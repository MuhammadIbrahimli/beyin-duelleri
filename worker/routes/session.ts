import { Hono } from "hono";
import { CITY_CODES } from "../../config/cities";
import type { AppEnv } from "../env";
import { auth, deviceOf } from "../middleware/auth";
import { randomNickname, signToken, verifyToken } from "../util";

export const sessionRoutes = new Hono<AppEnv>();

sessionRoutes.post("/session", async (c) => {
  const body = await c.req.json<{ token?: string }>().catch(() => ({}) as { token?: string });
  const now = Date.now();
  const existing = await verifyToken(c.env.SESSION_SECRET, body.token);
  if (existing) {
    const u = await c.env.DB.prepare("SELECT id, nickname, city_code FROM users WHERE id = ?")
      .bind(existing)
      .first<{ id: string; nickname: string; city_code: string | null }>();
    if (u) {
      await c.env.DB.prepare("UPDATE users SET last_seen_at = ?, device_class = ? WHERE id = ?")
        .bind(now, deviceOf(c), u.id)
        .run();
      return c.json({ user: { id: u.id, nickname: u.nickname, city: u.city_code }, token: body.token });
    }
  }
  const id = crypto.randomUUID();
  const nickname = randomNickname();
  await c.env.DB.prepare(
    "INSERT INTO users (id, nickname, device_class, created_at, last_seen_at) VALUES (?,?,?,?,?)",
  )
    .bind(id, nickname, deviceOf(c), now, now)
    .run();
  return c.json({ user: { id, nickname, city: null }, token: await signToken(c.env.SESSION_SECRET, id) }, 201);
});

export const meRoutes = new Hono<AppEnv>();
meRoutes.use("*", auth);

meRoutes.patch("/me", async (c) => {
  const id = c.get("userId");
  const b = await c.req.json<{ city?: string | null; rerollNickname?: boolean }>().catch(() => ({}) as any);
  if (b.city !== undefined) {
    if (b.city !== null && !(CITY_CODES as readonly string[]).includes(b.city)) return c.json({ error: "bad_city" }, 400);
    await c.env.DB.prepare("UPDATE users SET city_code = ? WHERE id = ?").bind(b.city, id).run();
  }
  if (b.rerollNickname) {
    await c.env.DB.prepare("UPDATE users SET nickname = ? WHERE id = ?").bind(randomNickname(), id).run();
  }
  const u = await c.env.DB.prepare("SELECT id, nickname, city_code FROM users WHERE id = ?").bind(id).first<any>();
  return c.json({ user: { id: u.id, nickname: u.nickname, city: u.city_code } });
});

/** "Məlumatlarımı sil": ON DELETE CASCADE removes runs, duel entries, daily, badges, anchors, shares and duels the user created. */
meRoutes.delete("/me", async (c) => {
  await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(c.get("userId")).run();
  return c.json({ ok: true });
});
