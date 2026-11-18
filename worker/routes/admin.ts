import { Hono } from "hono";
import { EXPERIMENTS, todayBaku } from "../../shared/experiments";
import { dayAdd } from "../../shared/streak";
import type { AppEnv } from "../env";
import { randomNickname, safeEqual } from "../util";

/** Owner-only analytics and moderation. Disabled (404) until the ADMIN_TOKEN secret is set. */
export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use("/admin/*", async (c, next) => {
  const secret = c.env.ADMIN_TOKEN;
  if (!secret) return c.json({ error: "not_found" }, 404);
  if (!safeEqual(c.req.header("x-admin-token") ?? "", secret)) return c.json({ error: "unauthorized" }, 401);
  await next();
});

// Baku calendar day of a millisecond timestamp column
const DAY = (col: string) => `date(${col} / 1000 + 14400, 'unixepoch')`;
const one = async (db: D1Database, sql: string, ...a: unknown[]) => (await db.prepare(sql).bind(...a).first<{ n: number }>())?.n ?? 0;
const rows = async <T = any>(db: D1Database, sql: string, ...a: unknown[]) => (await db.prepare(sql).bind(...a).all<T>()).results;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

/** All owner analytics as one object. Used by the dashboard and by the export; contains no names or emails. */
async function statsOf(db: D1Database) {
  const today = todayBaku();
  const since30 = dayAdd(today, -29);
  const since7 = dayAdd(today, -6);
  const sinceMs = Date.parse(since30 + "T00:00:00Z") - 4 * 3600000; // start of that Baku day

  const [totalUsers, dau, wau, mau] = await Promise.all([
    one(db, "SELECT COUNT(*) AS n FROM users"),
    one(db, "SELECT COUNT(DISTINCT user_id) AS n FROM activity WHERE day = ?", today),
    one(db, "SELECT COUNT(DISTINCT user_id) AS n FROM activity WHERE day >= ?", since7),
    one(db, "SELECT COUNT(DISTINCT user_id) AS n FROM activity WHERE day >= ?", since30),
  ]);

  const [dailyActive, dailyNew, dailyRuns, monthly, expRuns] = await Promise.all([
    rows(db, "SELECT day, COUNT(*) AS n FROM activity WHERE day >= ? GROUP BY day ORDER BY day", since30),
    rows(db, `SELECT ${DAY("created_at")} AS day, COUNT(*) AS n FROM users WHERE created_at >= ? GROUP BY day ORDER BY day`, sinceMs),
    rows(db, `SELECT ${DAY("finished_at")} AS day, COUNT(*) AS n FROM runs WHERE status = 'finished' AND finished_at >= ? GROUP BY day ORDER BY day`, sinceMs),
    rows(db, "SELECT substr(day, 1, 7) AS month, COUNT(DISTINCT user_id) AS n FROM activity GROUP BY month ORDER BY month DESC LIMIT 12"),
    rows(db, "SELECT experiment_id AS e, COUNT(*) AS n FROM runs WHERE status = 'finished' AND finished_at >= ? GROUP BY e", sinceMs),
  ]);

  // funnel over the last 30 days, counted in people (not events)
  const visited = mau;
  const [started, finished, shared, invited, friends] = await Promise.all([
    one(db, "SELECT COUNT(DISTINCT user_id) AS n FROM runs WHERE created_at >= ?", sinceMs),
    one(db, "SELECT COUNT(DISTINCT user_id) AS n FROM runs WHERE status = 'finished' AND finished_at >= ?", sinceMs),
    one(db, "SELECT COUNT(DISTINCT r.user_id) AS n FROM shares s JOIN runs r ON r.id = s.run_id WHERE s.created_at >= ?", sinceMs),
    one(db, "SELECT COUNT(DISTINCT r.user_id) AS n FROM duels d JOIN runs r ON r.id = d.creator_run_id WHERE d.created_at >= ?", sinceMs),
    one(db, "SELECT COUNT(*) AS n FROM duel_entries e JOIN duels d ON d.id = e.duel_id WHERE d.created_at >= ? AND e.run_id != d.creator_run_id", sinceMs),
  ]);

  // retention: of people who joined 8-37 days ago, how many came back exactly 1 / 7 days after their first day
  const CD = DAY("u.created_at");
  const cohort = async (n: number) => {
    const lo = dayAdd(today, -(n + 30)), hi = dayAdd(today, -n);
    const base = await one(db, `SELECT COUNT(*) AS n FROM users u WHERE ${CD} BETWEEN ? AND ?`, lo, hi);
    const kept = await one(db,
      `SELECT COUNT(*) AS n FROM users u WHERE ${CD} BETWEEN ? AND ?
       AND EXISTS (SELECT 1 FROM activity a WHERE a.user_id = u.id AND a.day = date(${CD}, '+${n} day'))`, lo, hi);
    return { base, kept, rate: pct(kept, base) };
  };

  const [cities, devices, langs, sources, withCity, profiles, emails, plays] = await Promise.all([
    rows(db, "SELECT city_code AS k, COUNT(*) AS n FROM users WHERE city_code IS NOT NULL GROUP BY k ORDER BY n DESC LIMIT 12"),
    rows(db, "SELECT device_class AS k, COUNT(*) AS n FROM users GROUP BY k ORDER BY n DESC"),
    rows(db, "SELECT lang AS k, COUNT(*) AS n FROM users GROUP BY k ORDER BY n DESC"),
    rows(db, "SELECT COALESCE(src, '(direct)') AS k, COUNT(*) AS n FROM users GROUP BY k ORDER BY n DESC LIMIT 15"),
    one(db, "SELECT COUNT(*) AS n FROM users WHERE city_code IS NOT NULL"),
    one(db, "SELECT COUNT(*) AS n FROM users WHERE profile_done = 1"),
    one(db, "SELECT COUNT(*) AS n FROM users WHERE email IS NOT NULL AND email_consent = 1"),
    one(db, "SELECT COUNT(*) AS n FROM runs WHERE status = 'finished' AND finished_at >= ?", sinceMs),
  ]);

  return {
    generatedAt: Date.now(),
    today,
    totals: { users: totalUsers, dau, wau, mau, playsLast30: plays, playsPerActiveUser: mau ? Math.round((plays / mau) * 10) / 10 : 0 },
    monthly: monthly.reverse(),
    daily: { active: dailyActive, newUsers: dailyNew, plays: dailyRuns },
    funnel: { visited, started, finished, shared, invited, friendsFinished: friends },
    retention: { d1: await cohort(1), d7: await cohort(7) },
    audience: { cities, devices, langs, sources, withCityPct: pct(withCity, totalUsers), profilePct: pct(profiles, totalUsers), consentedEmails: emails },
    experiments: EXPERIMENTS.map((e) => ({ slug: e.slug, plays: expRuns.find((r: any) => r.e === e.id)?.n ?? 0 })),
  };
}

adminRoutes.get("/admin/stats", async (c) => c.json(await statsOf(c.env.DB)));

/**
 * Whole analytics export. format=json (default) or format=csv. The CSV is one file with a block per table
 * ("# monthly", "# daily.plays", ...), so it opens in any spreadsheet program.
 */
adminRoutes.get("/admin/export", async (c) => {
  const s = await statsOf(c.env.DB);
  const stamp = s.today;
  if (c.req.query("format") === "csv") {
    return new Response(toCsv(s), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="beyin-analytics-${stamp}.csv"` } });
  }
  return new Response(JSON.stringify(s, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="beyin-analytics-${stamp}.json"` } });
});

/** Flattens the stats object into labelled CSV blocks. Arrays of rows become tables, nested objects become key/value blocks. */
export function toCsv(root: unknown): string {
  const out: string[] = [];
  const esc = (v: unknown) => { const str = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str; };
  const walk = (name: string, v: any) => {
    if (Array.isArray(v)) {
      if (!v.length) return;
      const cols = [...new Set(v.flatMap((o) => Object.keys(o ?? {})))];
      out.push(`# ${name}`, cols.join(","), ...v.map((o) => cols.map((c) => esc(o?.[c])).join(",")), "");
      return;
    }
    if (v && typeof v === "object") {
      const entries = Object.entries(v);
      const scalars = entries.filter(([, x]) => x === null || typeof x !== "object");
      if (scalars.length) out.push(`# ${name}`, "key,value", ...scalars.map(([k, x]) => `${esc(k)},${esc(x)}`), "");
      for (const [k, x] of entries) if (x && typeof x === "object") walk(`${name}.${k}`, x);
    }
  };
  walk("analytics", root);
  return out.join("\n");
}

/** Recently renamed or created profiles, for moderation. */
adminRoutes.get("/admin/names", async (c) => {
  const list = await rows(c.env.DB, "SELECT id, nickname, city_code AS city, created_at AS createdAt FROM users WHERE profile_done = 1 ORDER BY created_at DESC LIMIT 100");
  return c.json({ users: list });
});

adminRoutes.post("/admin/users/:id/reset-name", async (c) => {
  const r = await c.env.DB.prepare("UPDATE users SET nickname = ? WHERE id = ?").bind(randomNickname(), c.req.param("id")).run();
  return c.json({ ok: (r.meta?.changes ?? 0) > 0 });
});

/** Emails of people who agreed to receive news. */
adminRoutes.get("/admin/emails", async (c) => {
  const list = await rows(c.env.DB, "SELECT email, city_code AS city, lang, created_at AS createdAt FROM users WHERE email IS NOT NULL AND email_consent = 1 ORDER BY created_at");
  return c.json({ emails: list });
});
