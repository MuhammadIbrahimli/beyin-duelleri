// Owner-only dashboard at /admin. Loaded lazily; data comes from /api/admin/* guarded by the ADMIN_TOKEN secret.
import { h, mount } from "./dom";
import { adm } from "./i18n/admin.ru";
import { az } from "./i18n/az";

const KEY = "bd_admin";
const app = () => document.getElementById("app")!;

async function call(path: string, method = "GET") {
  const res = await fetch("/api" + path, { method, headers: { "x-admin-token": sessionStorage.getItem(KEY) ?? "" } });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

const fmt = (n: number) => n.toLocaleString("ru-RU");
const kpi = (label: string, v: string | number) => h("div", { class: "kpi" }, h("b", null, typeof v === "number" ? fmt(v) : v), h("span", null, label));

/** Simple bar chart: one bar per value, scaled to the largest. */
function bars(title: string, points: { label: string; n: number }[]) {
  const max = Math.max(1, ...points.map((p) => p.n));
  return h("div", { class: "card" }, h("b", { style: "font-size:1rem" }, title),
    points.length ? h("div", { class: "bars" }, ...points.map((p) =>
      h("i", { title: `${p.label}: ${p.n}`, style: `height:${Math.max(3, (p.n / max) * 100)}%` }))) : h("span", { class: "muted" }, "—"),
    points.length ? h("span", { class: "muted" }, `${points[0].label} → ${points[points.length - 1].label} · max ${fmt(max)}`) : null);
}

const table = (title: string, rows: { k: string; n: number }[], name = (k: string) => k) =>
  h("div", { class: "card" }, h("b", { style: "font-size:1rem" }, title),
    ...(rows.length ? rows.map((r) => h("div", { class: "kv" }, h("span", null, name(r.k)), h("b", null, fmt(r.n)))) : [h("span", { class: "muted" }, "—")]));

function mediaKit(s: any): string {
  const f = s.funnel, t = s.totals;
  const top = s.audience.cities.slice(0, 3).map((c: any) => az.cities[c.k] ?? c.k).join(", ");
  return [
    "Beyin duelləri: веб-игра с мини-экспериментами про мозг (реакция, внимание, память, восприятие)",
    `Данные на ${s.today}`,
    `• Уникальных посетителей за 30 дней: ${fmt(t.mau)} (за 7 дней: ${fmt(t.wau)}, сегодня: ${fmt(t.dau)})`,
    `• Пройдено тестов за 30 дней: ${fmt(t.playsLast30)} (${t.playsPerActiveUser} на человека)`,
    `• Дошли до результата: ${fmt(f.finished)} из ${fmt(f.visited)} зашедших`,
    `• Позвали друга: ${fmt(f.invited)} человек`,
    `• Возврат через 7 дней: ${s.retention.d7.rate}%`,
    top ? `• Топ городов: ${top}` : "",
    `• Мобильные устройства: ${s.audience.devices.filter((d: any) => d.k !== "desktop").reduce((a: number, d: any) => a + d.n, 0)} из ${s.audience.devices.reduce((a: number, d: any) => a + d.n, 0)} пользователей`,
    "Формат рекламы: спонсорский тест дня и сезонные челленджи между городами, всегда с пометкой «Sponsorlu». Персональные данные не передаются, только агрегаты.",
  ].filter(Boolean).join("\n");
}

async function dashboard() {
  mount(app(), h("div", { class: "screen" }, h("div", { class: "loader" })));
  let s: any, names: any, emails: any;
  try {
    [s, names, emails] = await Promise.all([call("/admin/stats"), call("/admin/names"), call("/admin/emails")]);
  } catch { sessionStorage.removeItem(KEY); return gate(adm.wrong); }

  const t = s.totals, f = s.funnel;
  const step = (label: string, n: number) => h("div", { class: "kv" }, h("span", null, label), h("b", null, `${fmt(n)} · ${f.visited ? Math.round((n / f.visited) * 100) : 0}%`));
  const kit = mediaKit(s);
  const copy = h("button", { class: "btn" }, adm.kit.copy);
  copy.addEventListener("click", async () => { await navigator.clipboard?.writeText(kit).catch(() => {}); copy.textContent = adm.kit.copied; });
  const dl = h("button", { class: "btn" }, adm.emails.download);
  dl.addEventListener("click", () => {
    const csv = "email,city,lang\n" + emails.emails.map((e: any) => `${e.email},${e.city ?? ""},${e.lang}`).join("\n");
    const a = h("a", { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: "emails.csv" });
    document.body.append(a); a.click(); a.remove();
  });

  const exportFile = (format: "json" | "csv") => async () => {
    const res = await fetch(`/api/admin/export?format=${format}`, { headers: { "x-admin-token": sessionStorage.getItem(KEY) ?? "" } });
    if (!res.ok) return;
    const blob = await res.blob();
    const a = h("a", { href: URL.createObjectURL(blob), download: `beyin-analytics-${s.today}.${format}` });
    document.body.append(a); a.click(); a.remove();
  };
  const exportBtns = h("div", { class: "row" },
    h("button", { class: "btn", onclick: exportFile("csv") }, adm.export.csv),
    h("button", { class: "btn", onclick: exportFile("json") }, adm.export.json));

  mount(app(), h("div", { class: "screen admin" },
    h("div", { class: "top" }, h("h1", null, adm.title), h("button", { class: "chip", onclick: () => void dashboard() }, adm.refresh)),
    exportBtns,
    h("div", { class: "kpis" }, kpi(adm.kpi.mau, t.mau), kpi(adm.kpi.wau, t.wau), kpi(adm.kpi.dau, t.dau), kpi(adm.kpi.users, t.users), kpi(adm.kpi.plays, t.playsLast30), kpi(adm.kpi.perUser, t.playsPerActiveUser)),
    bars(adm.charts.active, s.daily.active.map((d: any) => ({ label: d.day.slice(5), n: d.n }))),
    bars(adm.charts.newUsers, s.daily.newUsers.map((d: any) => ({ label: d.day.slice(5), n: d.n }))),
    bars(adm.charts.plays, s.daily.plays.map((d: any) => ({ label: d.day.slice(5), n: d.n }))),
    h("div", { class: "card" }, h("b", { style: "font-size:1rem" }, adm.charts.monthly),
      ...(s.monthly.length ? s.monthly.map((m: any) => h("div", { class: "kv" }, h("span", null, m.month), h("b", null, fmt(m.n)))) : [h("span", { class: "muted" }, "—")])),
    h("div", { class: "card" }, h("b", { style: "font-size:1rem" }, adm.funnel.title),
      step(adm.funnel.visited, f.visited), step(adm.funnel.started, f.started), step(adm.funnel.finished, f.finished),
      step(adm.funnel.shared, f.shared), step(adm.funnel.invited, f.invited),
      h("div", { class: "kv" }, h("span", null, adm.funnel.friendsFinished), h("b", null, fmt(f.friendsFinished)))),
    h("div", { class: "card" }, h("b", { style: "font-size:1rem" }, adm.retention.title),
      h("div", { class: "kv" }, h("span", null, adm.retention.d1), h("b", null, `${s.retention.d1.rate}%`)),
      h("span", { class: "muted" }, adm.retention.of.replace("{n}", String(s.retention.d1.base))),
      h("div", { class: "kv" }, h("span", null, adm.retention.d7), h("b", null, `${s.retention.d7.rate}%`)),
      h("span", { class: "muted" }, adm.retention.of.replace("{n}", String(s.retention.d7.base)))),
    table(adm.audience.cities, s.audience.cities, (k) => az.cities[k] ?? k),
    table(adm.audience.devices, s.audience.devices),
    table(adm.audience.langs, s.audience.langs),
    table(adm.audience.sources, s.audience.sources),
    h("div", { class: "card" },
      h("div", { class: "kv" }, h("span", null, adm.audience.withCity), h("b", null, `${s.audience.withCityPct}%`)),
      h("div", { class: "kv" }, h("span", null, adm.audience.profile), h("b", null, `${s.audience.profilePct}%`)),
      h("div", { class: "kv" }, h("span", null, adm.audience.emails), h("b", null, fmt(s.audience.consentedEmails)))),
    table(adm.experiments, s.experiments.map((e: any) => ({ k: e.slug, n: e.plays })), (k) => (az.experiments as any)[k]?.name ?? k),
    h("div", { class: "card" }, h("b", { style: "font-size:1rem" }, adm.kit.title), h("pre", { class: "kit" }, kit), copy, h("span", { class: "muted" }, adm.kit.note)),
    h("div", { class: "card" }, h("b", { style: "font-size:1rem" }, adm.mod.title),
      ...(names.users.length ? names.users.map((u: any) => {
        const b = h("button", { class: "chip" }, adm.mod.reset);
        b.addEventListener("click", async () => { await call(`/admin/users/${u.id}/reset-name`, "POST").catch(() => {}); b.textContent = adm.mod.done; (b as HTMLButtonElement).disabled = true; });
        return h("div", { class: "kv" }, h("span", null, `${u.nickname}${u.city ? " · " + (az.cities[u.city] ?? u.city) : ""}`), b);
      }) : [h("span", { class: "muted" }, adm.mod.empty)])),
    h("div", { class: "card" }, h("b", { style: "font-size:1rem" }, adm.emails.title),
      emails.emails.length ? h("span", { class: "muted" }, String(emails.emails.length)) : h("span", { class: "muted" }, adm.emails.none),
      emails.emails.length ? dl : null)));
}

function gate(msg = "") {
  const input = h("input", { class: "field", type: "password", placeholder: adm.tokenLabel, "aria-label": adm.tokenLabel, autocomplete: "off" }) as HTMLInputElement;
  const go = () => { sessionStorage.setItem(KEY, input.value.trim()); void dashboard(); };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  mount(app(), h("div", { class: "screen" }, h("h1", null, adm.title), h("p", { class: "muted" }, adm.tokenHint), input,
    msg ? h("p", { class: "soft" }, msg) : null, h("button", { class: "btn primary block", onclick: go }, adm.enter)));
}

export function admin() {
  if (sessionStorage.getItem(KEY)) void dashboard(); else gate();
}
