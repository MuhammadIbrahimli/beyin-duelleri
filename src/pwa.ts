import { h } from "./dom";
import { az } from "./i18n/az";

const KEY = "bd_runs";
let deferred: (Event & { prompt: () => Promise<void> }) | null = null;

export function initPwa() {
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as typeof deferred; });
  if ("serviceWorker" in navigator && location.hostname !== "localhost") {
    addEventListener("load", () => void navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }
}

/** Counts finished valid tests on this device (the install offer waits for the second one). */
export const countRun = () => localStorage.setItem(KEY, String(Number(localStorage.getItem(KEY) ?? 0) + 1));

/** "Add to home screen" button, shown only after the second finished test and only if the browser offers it. */
export function installOffer(): HTMLElement | null {
  if (!deferred || Number(localStorage.getItem(KEY) ?? 0) < 2) return null;
  return h("button", { class: "btn block", onclick: async () => {
    const d = deferred; deferred = null;
    await d?.prompt().catch(() => {});
    document.getElementById("install-offer")?.remove();
  }, id: "install-offer" }, az.pwa.install);
}
