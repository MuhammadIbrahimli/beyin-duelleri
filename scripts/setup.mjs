// One-time Cloudflare setup + first deploy:  npm run setup
// Needs `npx wrangler login` first. Later deploys: npm run deploy.
import { readFileSync, writeFileSync } from "node:fs";
import { newVapidKeys } from "./vapid.mjs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const run = (args, opts = {}) => spawnSync("npx", ["wrangler", ...args], { encoding: "utf8", shell: true, ...opts });
const show = (r) => { process.stdout.write(r.stdout ?? ""); process.stderr.write(r.stderr ?? ""); };
const fail = (m) => { console.error("\n" + m); process.exit(1); };

if (/not authenticated/i.test(run(["whoami"]).stdout + run(["whoami"]).stderr)) fail("Not logged in. Run: npx wrangler login");

// 1. D1 database (only if wrangler.toml still has the placeholder id)
let toml = readFileSync("wrangler.toml", "utf8");
if (toml.includes("TODO_RUN_wrangler_d1_create_beyin")) {
  const r = run(["d1", "create", "beyin"]);
  show(r);
  const id = /database_id\s*=\s*"([0-9a-f-]{36})"/.exec((r.stdout ?? "") + (r.stderr ?? ""))?.[1];
  if (!id) fail("Could not read the database_id from `wrangler d1 create`. Put it into wrangler.toml by hand.");
  toml = toml.replace("TODO_RUN_wrangler_d1_create_beyin", id);
  writeFileSync("wrangler.toml", toml);
  console.log("database_id saved to wrangler.toml");
}

// 2. migrations, build, deploy
for (const args of [["d1", "migrations", "apply", "beyin", "--remote"]]) { const r = run(args, { stdio: "inherit" }); if (r.status) fail("migrations failed"); }
if (spawnSync("npm", ["run", "build"], { stdio: "inherit", shell: true }).status) fail("build failed");
const dep = run(["deploy"]);
show(dep);
if (dep.status) fail("deploy failed");

// 3. session secret (created once; rotating it logs everybody out)
const list = run(["secret", "list"]);
if (!/SESSION_SECRET/.test(list.stdout ?? "")) {
  const r = run(["secret", "put", "SESSION_SECRET"], { input: randomBytes(32).toString("hex") + "\n" });
  show(r);
  if (r.status) fail("could not set SESSION_SECRET: run `npx wrangler secret put SESSION_SECRET` by hand");
}
// 4. admin token (owner dashboard at /admin). Printed once: save it, it is stored only as a Cloudflare secret.
let adminToken = null;
if (!/ADMIN_TOKEN/.test(list.stdout ?? "")) {
  adminToken = randomBytes(24).toString("hex");
  const r = run(["secret", "put", "ADMIN_TOKEN"], { input: adminToken + "\n" });
  show(r);
  if (r.status) { adminToken = null; console.error("could not set ADMIN_TOKEN: run `npx wrangler secret put ADMIN_TOKEN` by hand"); }
}
// 5. web push keys (streak reminders). The contact in VAPID_SUBJECT must be a mailto: or https: address you control.
if (!/VAPID_PRIVATE/.test(list.stdout ?? "")) {
  const k = newVapidKeys();
  for (const [name, value] of Object.entries(k)) {
    const r = run(["secret", "put", name], { input: value + "\n" });
    show(r);
    if (r.status) console.error(`could not set ${name}: push reminders stay off until you set it`);
  }
  console.log("Push keys created. Set VAPID_SUBJECT (mailto:you@example.com or your https site) with: npx wrangler secret put VAPID_SUBJECT");
}
const url = /https:\/\/[^\s]+\.workers\.dev/.exec(dep.stdout + dep.stderr)?.[0];
console.log(`\nDone.${url ? " Live at " + url : ""}`);
if (adminToken) console.log(`Admin panel: ${url ?? "<your url>"}/admin\nAdmin token (shown once, save it): ${adminToken}`);
