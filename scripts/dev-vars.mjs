// Creates .dev.vars with random SESSION_SECRET, ADMIN_TOKEN and VAPID keys on first run (git-ignored); adds whatever an older file lacks.
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { newVapidKeys } from "./vapid.mjs";

const rnd = () => randomBytes(24).toString("hex");
if (!existsSync(".dev.vars")) {
  writeFileSync(".dev.vars", `SESSION_SECRET=${rnd()}\nADMIN_TOKEN=${rnd()}\n`);
  console.log("created .dev.vars (admin token is inside)");
}
const cur = readFileSync(".dev.vars", "utf8");
const lead = cur.endsWith("\n") ? "" : "\n";
if (!cur.includes("ADMIN_TOKEN=")) {
  appendFileSync(".dev.vars", `${lead}ADMIN_TOKEN=${rnd()}\n`);
  console.log("added ADMIN_TOKEN to .dev.vars");
}
if (!cur.includes("VAPID_PRIVATE=")) {
  const k = newVapidKeys();
  appendFileSync(".dev.vars", `${lead}VAPID_PRIVATE=${k.VAPID_PRIVATE}\nVAPID_PUBLIC=${k.VAPID_PUBLIC}\nVAPID_SUBJECT=https://localhost\n`);
  console.log("added VAPID keys to .dev.vars");
}
