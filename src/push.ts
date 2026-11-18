// Web Push for streak reminders. The server sends an empty push; public/sw.js shows the text in the saved language.
import { api } from "./api";
import { getLang } from "./i18n";

const urlKey = (b64: string) => {
  const raw = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** False where the browser has no Push API (for example iPhone Safari until the app is added to the home screen). */
export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** The service worker cannot read localStorage, so the language lives in the Cache API. */
export const syncSwLang = () => { try { void caches?.open("bd-meta").then((c) => c.put("/lang", new Response(getLang()))); } catch { /* ignore */ } };

export async function pushEnabled(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return !!(await reg?.pushManager.getSubscription());
}

/** Resolves to "on", or the reason it did not turn on. */
export async function enablePush(): Promise<"on" | "denied" | "off"> {
  const k = await api<{ key: string }>("GET", "/push/key").catch(() => null);
  if (!k) return "off"; // push is not configured on this deployment
  if ((await Notification.requestPermission()) !== "granted") return "denied";
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlKey(k.key) }));
  await api("POST", "/push/subscribe", { endpoint: sub.endpoint, lang: getLang() });
  syncSwLang();
  return "on";
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api("POST", "/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
