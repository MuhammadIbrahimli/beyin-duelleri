// Passport sections that are about the account rather than the results: recovery code, reminders, vibration, recap cards.
import { api, me } from "./api";
import { h } from "./dom";
import { canVibrate, setVibration, vibrationOn } from "./fx";
import { az, t } from "./i18n";
import { disablePush, enablePush, pushEnabled, pushSupported } from "./push";
import { cardFooter, openCard } from "./screens";

const expName = (slug: string) => az.experiments[slug as keyof typeof az.experiments]?.name ?? slug;

/** On / off chip that keeps its own label. */
function toggle(on: boolean, label: (on: boolean) => string, change: (on: boolean) => Promise<boolean> | boolean): HTMLElement {
  const b = h("button", { class: "chip" + (on ? " on" : ""), "aria-pressed": String(on) }, label(on));
  b.addEventListener("click", async () => {
    b.setAttribute("disabled", "");
    const next = await change(!on);
    on = next;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
    b.textContent = label(on);
    b.removeAttribute("disabled");
  });
  return b;
}

export function vibrationRow(): HTMLElement | null {
  if (!canVibrate()) return null; // iPhone Safari: nothing to switch
  return h("div", { class: "kv-row" }, h("span", null, az.passport.vibration),
    toggle(vibrationOn(), (o) => (o ? az.passport.soundOn : az.passport.soundOff), (o) => { setVibration(o); return o; }));
}

/** Streak reminders (web push). Hidden when the browser cannot do push; explains iPhone's "add to home screen" rule. */
export function remindersRow(): HTMLElement {
  const note = h("p", { class: "muted", role: "status" });
  const slot = h("div");
  const row = h("div", null, h("div", { class: "kv-row" }, h("span", null, az.passport.remindTitle), slot), h("p", { class: "muted" }, az.passport.remindHint), note);
  if (!pushSupported()) { slot.append(h("span", { class: "muted" }, "—")); note.textContent = az.passport.remindUnsupported; return row; }
  void pushEnabled().then((on) => slot.append(toggle(on, (o) => (o ? az.passport.remindOn : az.passport.remindOff), async (want) => {
    note.textContent = "";
    if (!want) { await disablePush(); return false; }
    const r = await enablePush().catch(() => "off" as const);
    if (r === "denied") note.textContent = az.passport.remindDenied;
    if (r === "off") note.textContent = az.common.error;
    return r === "on";
  })));
  return row;
}

/** Recovery code: shown once on request; entering one on another device signs that account in. */
export function recoverySection(): HTMLElement {
  const shown = h("div");
  const showBtn = h("button", { class: "btn block" }, az.passport.recoveryShow);
  showBtn.addEventListener("click", async () => {
    const r = await api<{ code: string }>("POST", "/me/recovery").catch(() => null);
    shown.replaceChildren(r
      ? h("div", { class: "notice" }, h("b", { class: "recovery-code" }, r.code), h("p", { class: "muted" }, az.passport.recoveryWarn))
      : h("p", { class: "soft" }, az.common.error));
  });

  const input = h("input", { class: "field", placeholder: az.passport.recoveryPh, maxlength: 14, autocapitalize: "characters", autocomplete: "off", "aria-label": az.passport.recoveryEnter }) as HTMLInputElement;
  const msg = h("p", { class: "soft", role: "alert" });
  const enter = h("button", { class: "btn" }, az.passport.recoveryEnter);
  enter.addEventListener("click", async () => {
    msg.textContent = "";
    const res = await fetch("/api/session/restore", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: input.value, token: localStorage.getItem("bd_token") }),
    }).catch(() => null);
    if (!res || !res.ok) { msg.textContent = res && res.status < 500 ? az.passport.recoveryBad : az.common.error; return; }
    const j = await res.json();
    localStorage.setItem("bd_token", j.token);
    location.href = "/";
  });
  return h("div", null,
    h("h2", null, az.passport.recoveryTitle), h("p", { class: "muted" }, az.passport.recoveryHint),
    showBtn, shown, h("div", { class: "pair-input" }, input, enter), msg);
}

/** Weekly / monthly recap cards, built from the server's rolling 7 / 30 day summary. */
export function recapSection(): HTMLElement {
  const msg = h("p", { class: "soft", role: "status" });
  const open = (period: "week" | "month") => async () => {
    msg.textContent = "";
    const r = await api("GET", `/me/recap?period=${period}`).catch(() => null);
    if (!r) { msg.textContent = az.common.error; return; }
    if (!r.runs) { msg.textContent = az.recap.empty; return; }
    const d = r.overall.delta;
    const lines = [
      t("recap.activity", { runs: r.runs, days: r.activeDays }),
      t("recap.delta", { d: (d > 0 ? "+" : "") + d }),
      ...(r.best ? [t("recap.best", { name: expName(r.best.slug), n: r.best.points })] : []),
      ...(r.streak > 0 ? [t("passport.streak", { n: r.streak })] : []),
      ...(r.rank && r.rank.of > 1 ? [t("recap.place", { place: r.rank.place, of: r.rank.of })] : []),
    ];
    void openCard((m) => ({ kind: "recap", model: m.recapCard({
      brand: az.app.name, nickname: me()?.nickname ?? "", title: period === "week" ? az.recap.cardWeek : az.recap.cardMonth,
      score: String(r.overall.score), lines, footer: cardFooter() }) }));
  };
  return h("div", null, h("h2", null, az.recap.heading),
    h("div", { class: "pair" }, h("button", { class: "btn", onclick: open("week") }, az.recap.week), h("button", { class: "btn", onclick: open("month") }, az.recap.month)), msg);
}
