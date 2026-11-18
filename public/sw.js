// Minimal service worker: makes the app installable. No offline caching on purpose:
// results and duels always need the server, and stale code would break the timing experiments.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
