import { Hono } from "hono";
import { aggregate } from "./aggregate";
import type { AppEnv, Env } from "./env";
import { rateLimit } from "./middleware/auth";
import { adminRoutes } from "./routes/admin";
import { duelRoutes } from "./routes/duels";
import { duel5Routes } from "./routes/duel5";
import { groupRoutes } from "./routes/groups";
import { miscRoutes } from "./routes/misc";
import { pushRoutes } from "./routes/push";
import { recapRoutes } from "./routes/recap";
import { roomRoutes } from "./routes/rooms";
import { sendStreakReminders } from "./push";
import { runRoutes } from "./routes/runs";
import { meRoutes, sessionRoutes } from "./routes/session";
import { sharePage } from "./share";

export { Room } from "./room";
export { Queue } from "./queue";

export const app = new Hono<AppEnv>().basePath("/api");
app.use("*", rateLimit);
app.route("/", sessionRoutes);
// Mounted before any sub-app that calls use("*", auth): Hono applies those middlewares to every route registered after them.
app.route("/", roomRoutes);
app.route("/", duel5Routes); // same reason as the rooms: sub-apps below put auth on every route after them
app.route("/", adminRoutes); // before the user routes: it has its own token check
app.route("/", meRoutes);
app.route("/", runRoutes);
app.route("/", duelRoutes);
app.route("/", groupRoutes);
app.route("/", pushRoutes);
app.route("/", recapRoutes);
app.route("/", miscRoutes);
app.notFound((c) => c.json({ error: "not_found" }, 404));
app.onError((e, c) => {
  console.error(e);
  return c.json({ error: "server_error" }, 500);
});

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // invite links from chats get their own preview; everything else goes to the API and the app
    const m = new URL(request.url).pathname.match(/^\/(d|g)\/([A-Za-z0-9]{3,16})$/);
    if (m && request.method === "GET") return sharePage(request, env, m[1] as "d" | "g", m[2]);
    return app.fetch(request, env, ctx);
  },
  async scheduled(_e: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(Promise.all([aggregate(env.DB), sendStreakReminders(env)]));
  },
} satisfies ExportedHandler<Env>;
