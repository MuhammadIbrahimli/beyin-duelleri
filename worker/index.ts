import { Hono } from "hono";
import { aggregate } from "./aggregate";
import type { AppEnv, Env } from "./env";
import { rateLimit } from "./middleware/auth";
import { adminRoutes } from "./routes/admin";
import { duelRoutes } from "./routes/duels";
import { groupRoutes } from "./routes/groups";
import { miscRoutes } from "./routes/misc";
import { pushRoutes } from "./routes/push";
import { recapRoutes } from "./routes/recap";
import { sendStreakReminders } from "./push";
import { runRoutes } from "./routes/runs";
import { meRoutes, sessionRoutes } from "./routes/session";

export const app = new Hono<AppEnv>().basePath("/api");
app.use("*", rateLimit);
app.route("/", sessionRoutes);
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
  fetch: app.fetch,
  async scheduled(_e: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(Promise.all([aggregate(env.DB), sendStreakReminders(env)]));
  },
} satisfies ExportedHandler<Env>;
