// Creates .dev.vars with a random SESSION_SECRET on first run (it is git-ignored).
import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

if (!existsSync(".dev.vars")) {
  writeFileSync(".dev.vars", `SESSION_SECRET=${randomBytes(32).toString("hex")}\n`);
  console.log("created .dev.vars");
}
