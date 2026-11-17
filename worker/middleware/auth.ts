import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";
import { deviceClassFromUA, hashIp, verifyToken } from "../util";

export const rateLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
  const rl = c.env.RATE_LIMITER;
  if (rl) {
    const ip = c.req.header("cf-connecting-ip") ?? "unknown";
    const key = await hashIp(c.env.SESSION_SECRET, ip, new Date().toISOString().slice(0, 10));
    const { success } = await rl.limit({ key });
    if (!success) return c.json({ error: "rate_limited" }, 429);
  }
  await next();
};

export const auth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const h = c.req.header("authorization") ?? "";
  const id = await verifyToken(c.env.SESSION_SECRET, h.startsWith("Bearer ") ? h.slice(7) : null);
  if (!id) return c.json({ error: "unauthorized" }, 401);
  const u = await c.env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(id).first();
  if (!u) return c.json({ error: "unauthorized" }, 401);
  c.set("userId", id);
  await next();
};

export const deviceOf = (c: { req: { header: (n: string) => string | undefined } }) =>
  deviceClassFromUA(c.req.header("user-agent"));
