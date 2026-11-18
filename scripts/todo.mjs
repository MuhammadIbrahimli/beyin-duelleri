// Lists every TODO(verify) in the project: data and text that must be checked before launch.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["config", "src", "shared", "worker", "migrations", "scripts", "wrangler.toml"];
let n = 0;
const walk = (p) => {
  if (statSync(p).isDirectory()) return readdirSync(p).forEach((f) => walk(join(p, f)));
  if (p.endsWith("todo.mjs")) return;
  readFileSync(p, "utf8").split(/\r?\n/).forEach((l, i) => {
    if (l.includes("TODO(verify)")) { n++; console.log(`${p.replaceAll("\\", "/")}:${i + 1}: ${l.trim().slice(0, 140)}`); }
  });
};
ROOTS.forEach(walk);
console.log(`\n${n} item(s)`);
