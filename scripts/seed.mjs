// Fills the LOCAL D1 with fake finished runs so the city ranking and percentiles have data to show.
//   node scripts/seed.mjs          add the fake data (ids start with "seed-")
//   node scripts/seed.mjs --remove delete exactly that data again
// Then refresh the aggregates:  npm run db:cron   (dev server must be running)
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const remove = process.argv.includes("--remove");
let seed = 12345;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const gauss = (mean, sd) => mean + sd * Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
const q = (v) => (v === null ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

const sql = [];
if (remove) {
  sql.push("DELETE FROM users WHERE id LIKE 'seed-%';"); // runs, duels, entries, daily cascade
} else {
  // [city, users, mean reaction ms]; null = no city chosen
  const cities = [["baki", 70, 285], ["gence", 45, 300], ["sumqayit", 32, 292], ["seki", 12, 310], ["lenkeran", 8, 305], [null, 40, 295]];
  const devices = ["android", "android", "ios", "desktop"];
  const now = Date.now();
  let i = 0;
  for (const [city, n, mean] of cities) {
    for (let k = 0; k < n; k++, i++) {
      const uid = `seed-u${i}`, dc = devices[i % devices.length];
      const t = now - Math.floor(rnd() * 3 * 86400000);
      sql.push(`INSERT OR REPLACE INTO users (id,nickname,city_code,device_class,created_at,last_seen_at) VALUES (${q(uid)},${q("Test " + i)},${q(city)},${q(dc)},${t},${t});`);
      const refleks = Math.max(150, Math.round(gauss(mean, 40)));
      sql.push(`INSERT OR REPLACE INTO runs (id,user_id,experiment_id,seed,status,primary_score,secondary_json,level,valid,device_class,created_at,finished_at) VALUES (${q("seed-r" + i + "-1")},${q(uid)},1,${i},'finished',${refleks},'{"earlyTaps":0}',${refleks < 230 ? 4 : refleks < 280 ? 3 : refleks < 350 ? 2 : 1},1,${q(dc)},${t},${t});`);
      if (i % 2 === 0) {
        const focus = Math.max(500, Math.round(gauss(900, 150)));
        sql.push(`INSERT OR REPLACE INTO runs (id,user_id,experiment_id,seed,status,primary_score,secondary_json,level,valid,device_class,created_at,finished_at) VALUES (${q("seed-r" + i + "-2")},${q(uid)},2,${i},'finished',${focus},'{"errors":0,"interference":120}',${focus < 650 ? 4 : focus < 850 ? 3 : focus < 1100 ? 2 : 1},1,${q(dc)},${t},${t});`);
      }
    }
  }
}

mkdirSync(".wrangler", { recursive: true });
writeFileSync(".wrangler/seed.sql", sql.join("\n") + "\n");
const r = spawnSync("npx", ["wrangler", "d1", "execute", "beyin", "--local", "--file=.wrangler/seed.sql"], { stdio: "inherit", shell: true });
process.exit(r.status ?? 1);
