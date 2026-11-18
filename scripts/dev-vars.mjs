// Creates .dev.vars with random SESSION_SECRET and ADMIN_TOKEN on first run (git-ignored). Adds ADMIN_TOKEN to older files.
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const rnd = () => randomBytes(24).toString("hex");
if (!existsSync(".dev.vars")) {
  writeFileSync(".dev.vars", `SESSION_SECRET=${rnd()}
ADMIN_TOKEN=${rnd()}
`);
  console.log("created .dev.vars (admin token is inside)");
} else if (!readFileSync(".dev.vars", "utf8").includes("ADMIN_TOKEN=")) {
  appendFileSync(".dev.vars", `ADMIN_TOKEN=${rnd()}
`);
  console.log("added ADMIN_TOKEN to .dev.vars");
}
