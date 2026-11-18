// Service worker: makes the app installable and shows the streak reminder (web push). No offline caching on
// purpose: results and duels always need the server, and stale code would break the timing experiments.
const TEXT = {
  az: { title: "Seriyan yanmaq üzrədir", body: "Bu gün günün testini hələ keçməmisən. Bir dəqiqə bəsdir." },
  ru: { title: "Серия вот-вот прервётся", body: "Тест дня сегодня ещё не пройден. Хватит одной минуты." },
};
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

// The push carries no payload: the language is read from the Cache API (the page saves it there).
self.addEventListener("push", (e) => e.waitUntil((async () => {
  let lang = "az";
  try { const r = await (await caches.open("bd-meta")).match("/lang"); if (r) lang = await r.text(); } catch (_) {}
  const m = TEXT[lang] || TEXT.az;
  await self.registration.showNotification(m.title, { body: m.body, icon: "/icon-192.png", badge: "/icon-192.png", tag: "streak" });
})()));

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((cs) => (cs.length && "focus" in cs[0] ? cs[0].focus() : self.clients.openWindow("/"))));
});
