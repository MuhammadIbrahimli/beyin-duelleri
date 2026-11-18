// Duellər, Reytinq, Pasport and Məxfilik screens: loaded lazily, they are not on the first-play path.
import { CITY_CODES } from "../config/cities";
import { bySlug } from "../shared/experiments";
import { api, me } from "./api";
import { h } from "./dom";
import { icon } from "./icons";
import { az, t } from "./i18n/az";
import { accent, cardFooter, formatScore, openCard, screen, showError } from "./screens";

const expName = (slug: string) => az.experiments[slug as keyof typeof az.experiments].name;
const SLUGS = Object.keys(az.experiments);

// ---- Duellər -------------------------------------------------------------------
export async function duelsTab() {
  let data: any;
  try { data = await api("GET", "/me/duels"); } catch { return showError(); }
  screen("duels",
    h("h1", null, az.duels.title),
    ...(data.duels.length === 0 ? [h("p", { class: "muted" }, az.duels.empty)] : [h("div", { class: "list" }, ...data.duels.map((d: any) =>
      h("a", { class: "list-row", style: accent(d.slug), href: `/duel/${d.code}`, "data-link": "" },
        icon(d.slug, 28),
        h("div", { class: "txt" }, h("b", null, expName(d.slug)),
          h("span", null, [az.duels[d.status as "open" | "closed" | "expired"], t("duels.players", { n: d.finished }),
            d.myRank ? t("duels.rank", { n: d.myRank }) : ""].filter(Boolean).join(" · "))),
        icon("chevron", 18))))]));
}

// ---- Şəhər reytinqi ------------------------------------------------------------------
const fmt = (slug: string, v: number) => formatScore(slug, Number.isInteger(v) ? v : Math.round(v * 10) / 10);

export async function ranking(slug = new URLSearchParams(location.search).get("e") ?? "refleks") {
  if (!SLUGS.includes(slug)) slug = "refleks";
  let data: any;
  try { data = await api("GET", `/rankings/cities?experiment=${slug}`); } catch { return showError(); }
  const myCity = me()?.city ?? null;

  const expChips = h("div", { class: "chips" }, ...SLUGS.map((s) =>
    h("button", { class: "chip" + (s === slug ? " on" : ""), onclick: () => { history.replaceState({}, "", `/ranking?e=${s}`); void ranking(s); } }, expName(s))));
  const cityChips = h("div", { class: "chips" }, ...CITY_CODES.map((c) =>
    h("button", { class: "chip" + (c === myCity ? " on" : ""), onclick: async () => {
      const r = await api("PATCH", "/me", { city: c === myCity ? null : c }).catch(() => null);
      if (r && me()) (me() as any).city = r.user.city;
      void ranking(slug);
    } }, az.cities[c])));

  const rows = data.cities.map((c: any) =>
    h("tr", { class: c.city === myCity ? "me" : "" },
      h("td", null, az.cities[c.city] ?? c.city, h("br"), h("small", { class: "muted" }, t("ranking.people", { n: c.n }))),
      h("td", null, fmt(slug, c.median))));

  screen("rank",
    h("h1", null, az.ranking.title), expChips,
    rows.length ? h("table", { class: "tbl" }, ...rows) : h("p", { class: "muted" }, az.ranking.empty),
    h("p", { class: "muted" }, az.ranking.note),
    h("p", { class: "muted" }, az.ranking.disclaimer),
    h("h2", null, az.ranking.pick), cityChips);
}

// ---- Beyin pasportum -----------------------------------------------------------------
const WEEK = 7 * 86400000;

function bestOf(slug: string, scores: number[]): number | null {
  if (!scores.length) return null;
  return bySlug(slug)!.direction === "lower" ? Math.min(...scores) : Math.max(...scores);
}

function spark(points: number[]): SVGElement | null {
  if (points.length < 2) return null;
  const min = Math.min(...points), max = Math.max(...points), span = max - min || 1;
  const d = points.map((v, i) => `${i ? "L" : "M"}${(i / (points.length - 1)) * 120} ${30 - ((v - min) / span) * 28}`).join(" ");
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 120 32");
  svg.setAttribute("class", "spark");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", d);
  svg.append(path);
  return svg;
}

export async function passport() {
  let p: any;
  try { p = await api("GET", "/me/passport"); } catch { return showError(); }
  const now = Date.now();

  const cards = p.experiments.map((x: any) => {
    const thisWeek = x.history.filter((r: any) => r.at >= now - WEEK).map((r: any) => r.score);
    const lastWeek = x.history.filter((r: any) => r.at < now - WEEK && r.at >= now - 2 * WEEK).map((r: any) => r.score);
    const a = bestOf(x.slug, lastWeek), b = bestOf(x.slug, thisWeek);
    const level = x.best?.level ? ` · ${az.result.levels[x.slug]?.[x.best.level - 1] ?? ""}` : "";
    return h("div", { class: "card", style: accent(x.slug) },
      h("div", { style: "display:flex;align-items:center;gap:10px;color:var(--accent)" }, icon(x.slug, 24), h("b", { style: "color:var(--c-text)" }, expName(x.slug))),
      x.best
        ? h("span", null, t("passport.best", { v: fmt(x.slug, x.best.score) }) + level + " · " + t("passport.runs", { n: x.runs }))
        : h("span", { class: "muted" }, az.passport.empty),
      // honest wording: a changed result is not "a better brain" (practice effect)
      a !== null && b !== null && a !== b
        ? h("span", { class: "soft" }, t("passport.changed", { a: fmt(x.slug, a), b: fmt(x.slug, b) })) : null,
      spark(x.history.map((r: any) => r.score).reverse()));
  });

  const badgeItems = p.badges.map((id: string) => {
    const b = az.badges[id];
    return h("div", { class: "card", style: "--accent: var(--c-primary)" },
      h("b", null, b.name), h("span", { class: "muted" }, b.desc),
      h("button", { class: "btn", onclick: () => void openCard((m) => ({ kind: "badge", model: m.badgeCard({
        brand: az.app.name, nickname: me()?.nickname ?? "", name: b.name, desc: b.desc, footer: cardFooter() }) })) }, az.card.open));
  });

  let confirming = false;
  const del = h("button", { class: "btn block" }, az.passport.delete);
  del.addEventListener("click", async () => {
    if (!confirming) {
      confirming = true;
      del.textContent = az.passport.deleteYes;
      del.before(h("p", { class: "notice" }, az.passport.deleteConfirm));
      return;
    }
    await api("DELETE", "/me").catch(() => {});
    localStorage.removeItem("bd_token");
    location.href = "/";
  });

  screen("pass",
    h("div", { class: "nick" }, me()?.nickname ?? ""),
    h("h1", null, az.passport.title),
    h("p", null, t("passport.streak", { n: p.streak })),
    ...cards,
    h("h2", null, az.passport.badges),
    ...(badgeItems.length ? badgeItems : [h("p", { class: "muted" }, az.passport.noBadges)]),
    h("h2", null, az.passport.settings),
    h("button", { class: "btn block", onclick: async () => {
      const r = await api("PATCH", "/me", { rerollNickname: true }).catch(() => null);
      if (r && me()) (me() as any).nickname = r.user.nickname;
      void passport();
    } }, az.passport.reroll),
    del,
    h("a", { class: "link", href: "/privacy", "data-link": "" }, az.passport.privacy));
}

export function privacy() {
  screen("pass", h("h1", null, az.privacy.title), ...az.privacy.body.map((l) => h("p", null, l)),
    h("a", { class: "link", href: "/passport", "data-link": "" }, az.common.back));
}

