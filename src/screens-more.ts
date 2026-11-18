// Duellər, Reytinq, Pasport and Məxfilik screens: loaded lazily, they are not on the first-play path.
import { CITY_CODES } from "../config/cities";
import { bySlug } from "../shared/experiments";
import { api, me } from "./api";
import { h } from "./dom";
import { icon } from "./icons";
import { az, t } from "./i18n";
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

// ---- Reytinq: Beyin balı by city and by player -------------------------------------------
type RankView = "cities" | "players";

export async function ranking(view: RankView = "players", cityOnly = false) {
  const myCity = me()?.city ?? null;
  let cities: any, players: any;
  try {
    [cities, players] = await Promise.all([
      api("GET", "/rankings/cities"),
      api("GET", `/rankings/players${cityOnly && myCity ? `?city=${myCity}` : ""}`),
    ]);
  } catch { return showError(); }

  const tab = (v: RankView, label: string) => h("button", { class: "chip" + (v === view ? " on" : ""), onclick: () => void ranking(v, cityOnly) }, label);
  const cityRows = cities.cities.map((c: any, i: number) =>
    h("li", { class: c.city === myCity ? "me" : "" },
      h("span", { class: "rk" }, String(i + 1)),
      h("span", { class: "who" }, az.cities[c.city] ?? c.city, h("small", { class: "muted" }, t("ranking.playersCount", { n: c.players }))),
      h("b", null, String(c.score))));
  const playerRows = players.players.map((p: any, i: number) =>
    h("li", { class: p.isMe ? "me" : "" },
      h("span", { class: "rk" }, String(i + 1)),
      h("span", { class: "who" }, p.isMe ? `${p.nickname} (${az.ranking.you})` : p.nickname,
        h("small", { class: "muted" }, [p.city ? az.cities[p.city] : "", t("ranking.played", { n: p.played, total: players.total })].filter(Boolean).join(" · "))),
      h("b", null, String(p.score))));
  const list = view === "cities" ? cityRows : playerRows;

  screen("rank",
    h("h1", null, az.ranking.title),
    h("div", { class: "chips" }, tab("players", az.ranking.players), tab("cities", az.ranking.cities),
      view === "players" && myCity
        ? h("button", { class: "chip" + (cityOnly ? " on" : ""), onclick: () => void ranking(view, !cityOnly) }, az.ranking.myCity) : null),
    players.me && view === "players" ? h("p", { class: "soft" }, t("ranking.myRank", { n: players.me.rank })) : null,
    list.length ? h("ol", { class: "lb rank" }, ...list) : h("p", { class: "muted" }, az.ranking.empty),
    !myCity ? h("p", { class: "muted" }, az.ranking.cityHint) : null,
    h("details", null, h("summary", null, az.ranking.points + "?"), h("p", null, az.ranking.note), h("p", { class: "muted" }, az.ranking.notIq)));
}

// ---- Beyin pasportum -----------------------------------------------------------------
const fmt = (slug: string, v: number) => formatScore(slug, Number.isInteger(v) ? v : Math.round(v * 10) / 10);
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
      h("div", { style: "display:flex;align-items:center;gap:10px;color:var(--accent)" }, icon(x.slug, 24), h("b", { style: "color:var(--c-text)" }, expName(x.slug)),
        x.best ? h("span", { class: "pts" }, t("passport.pointsOf", { n: x.best.points })) : null),
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
    h("div", { class: "panel", style: "--accent: var(--c-primary)" },
      h("span", { class: "nick" }, az.passport.overall),
      h("div", { class: "hero-wrap" }, h("div", { class: "hero" }, String(p.overall.score)), h("span", { class: "unit" }, az.result.points)),
      h("div", { class: "bar", style: `--v:${p.overall.played / p.overall.total}` }, h("i")),
      h("p", { class: "muted" }, [t("result.overallSub", { played: p.overall.played, total: p.overall.total }), p.overall.rank ? t("passport.place", { n: p.overall.rank }) : ""].filter(Boolean).join(" · ")),
      h("button", { class: "btn", onclick: () => void openCard((m) => ({ kind: "score", model: m.scoreCard({
        brand: az.app.name, nickname: me()?.nickname ?? "", title: az.passport.overall, score: String(p.overall.score),
        sub: [t("result.overallSub", { played: p.overall.played, total: p.overall.total }), p.overall.rank ? t("passport.place", { n: p.overall.rank }) : ""].filter(Boolean).join(" · "),
        footer: cardFooter() }) })) }, az.card.open)),
    h("p", null, t("passport.streak", { n: p.streak })),
    ...cards,
    h("h2", null, az.passport.badges),
    ...(badgeItems.length ? badgeItems : [h("p", { class: "muted" }, az.passport.noBadges)]),
    h("h2", null, az.passport.settings),
    h("button", { class: "btn block", onclick: () => void import("./profile").then((m) => m.openProfileSheet(() => void passport())) }, az.profile.edit),
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

