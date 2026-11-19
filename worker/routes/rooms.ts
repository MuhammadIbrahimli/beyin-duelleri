import { Hono } from "hono";
import type { AppEnv } from "../env";
import { auth } from "../middleware/auth";
import { newDuelCode } from "../util";

export const roomRoutes = new Hono<AppEnv>();

const CODE = /^[A-Z0-9]{4,8}$/;

/** Creates a room code. Nothing is stored in D1: the room lives in its Durable Object until the game ends. */
roomRoutes.post("/rooms", auth, (c) => {
  if (!c.env.ROOMS) return c.json({ error: "rooms_unavailable" }, 503);
  return c.json({ code: newDuelCode(6).toUpperCase() });
});

/** WebSocket for one room. The first message must be {t:"hello", token}; the token is checked inside the Durable Object. */
roomRoutes.get("/rooms/:code/ws", async (c) => {
  const code = c.req.param("code");
  if (!CODE.test(code)) return c.json({ error: "bad_code" }, 400);
  if (c.req.header("upgrade")?.toLowerCase() !== "websocket") return c.json({ error: "expected_websocket" }, 426);
  if (!c.env.ROOMS) return c.json({ error: "rooms_unavailable" }, 503);
  const headers = new Headers(c.req.raw.headers);
  headers.set("x-room-code", code);
  const stub = c.env.ROOMS.get(c.env.ROOMS.idFromName(code));
  return stub.fetch(new Request(c.req.raw, { headers }));
});
