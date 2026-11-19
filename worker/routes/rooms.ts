import { Hono } from "hono";
import type { AppEnv } from "../env";
import { auth } from "../middleware/auth";
import { newDuelCode, newSeed } from "../util";

export const roomRoutes = new Hono<AppEnv>();

const CODE = /^[A-Z0-9]{4,8}$/;

/** Creates a room for the chosen game and sets it up inside its Durable Object. Nothing is stored in D1. */
roomRoutes.post("/rooms", auth, async (c) => {
  if (!c.env.ROOMS) return c.json({ error: "rooms_unavailable" }, 503);
  const b = await c.req.json<{ game?: unknown }>().catch(() => ({}) as { game?: unknown });
  const game = b.game === "grid" ? "grid" : "first";
  const code = newDuelCode(6).toUpperCase();
  const stub = c.env.ROOMS.get(c.env.ROOMS.idFromName(code));
  const res = await stub.fetch("https://room/init", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ game, seed: newSeed() }),
  });
  if (!res.ok) return c.json({ error: "server_error" }, 500);
  return c.json({ code, game });
});

/** WebSocket for one room. The first message must be {t:"hello", token}; the token is checked inside the Durable Object. */
roomRoutes.get("/rooms/:code/ws", async (c) => {
  const code = c.req.param("code");
  if (!CODE.test(code)) return c.json({ error: "bad_code" }, 400);
  if (c.req.header("upgrade")?.toLowerCase() !== "websocket") return c.json({ error: "expected_websocket" }, 426);
  if (!c.env.ROOMS) return c.json({ error: "rooms_unavailable" }, 503);
  const stub = c.env.ROOMS.get(c.env.ROOMS.idFromName(code));
  return stub.fetch(c.req.raw);
});
