import { Hono } from "hono";
import type { AppEnv } from "../env";
import { auth } from "../middleware/auth";
import { pushConfigured, validEndpoint } from "../push";

export const pushRoutes = new Hono<AppEnv>();
pushRoutes.use("/push/*", auth);

const MAX_PER_USER = 5;

/** The public key the browser needs to subscribe; 404 when push is not configured on this deployment. */
pushRoutes.get("/push/key", (c) => (pushConfigured(c.env) ? c.json({ key: c.env.VAPID_PUBLIC }) : c.json({ error: "push_off" }, 404)));

pushRoutes.post("/push/subscribe", async (c) => {
  const b = await c.req.json<{ endpoint?: string; lang?: string }>().catch(() => ({}) as any);
  const endpoint = validEndpoint(b.endpoint);
  if (!endpoint) return c.json({ error: "bad_endpoint" }, 400);
  const me = c.get("userId");
  const db = c.env.DB;
  const mine = await db.prepare("SELECT COUNT(*) AS n FROM push_subs WHERE user_id = ? AND endpoint <> ?").bind(me, endpoint).first<{ n: number }>();
  if ((mine?.n ?? 0) >= MAX_PER_USER) return c.json({ error: "too_many" }, 409);
  await db.prepare(
    "INSERT INTO push_subs (endpoint, user_id, lang, created_at) VALUES (?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, lang = excluded.lang",
  ).bind(endpoint, me, b.lang === "ru" ? "ru" : "az", Date.now()).run();
  return c.json({ ok: true });
});

pushRoutes.post("/push/unsubscribe", async (c) => {
  const b = await c.req.json<{ endpoint?: string }>().catch(() => ({}) as any);
  const endpoint = validEndpoint(b.endpoint);
  if (endpoint) await c.env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?").bind(endpoint, c.get("userId")).run();
  return c.json({ ok: true });
});
