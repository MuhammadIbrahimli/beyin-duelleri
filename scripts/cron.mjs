// Triggers the scheduled aggregate (percentiles + city ranking) on the running local dev server.
const res = await fetch("http://localhost:8787/__scheduled?cron=15+*+*+*+*").catch(() => null);
console.log(res?.ok ? "aggregate triggered" : "dev server not reachable: start it with `npm run dev` first");
process.exit(res?.ok ? 0 : 1);
