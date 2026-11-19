// Duellər, Reytinq, Pasport and Məxfilik screens: loaded lazily, they are not on the first-play path.
import { CITY_CODES } from "../config/cities";
import { bySlug } from "../shared/experiments";
import { api, me } from "./api";
import { go } from "./router";
import { recapSection, recoverySection, remindersRow, vibrationRow } from "./account";
import { h } from "./dom";
import { setSound, soundOn } from "./fx";
import { icon } from "./icons";
import { az, t } from "./i18n";
import { accent, cardFooter, formatScore, langSwitch, openCard, screen, showError } from "./screens";

const expName = (slug: string) => az.experiments[slug as keyof typeof az.experiments].name;
const SLUGS = Object.keys(az.experiments);

// ---- Duellər + persistent groups --------------------------------------------------
export async function duelsTab() {
  let data: any, groups: any;
  try { [data, groups] = await Promise.all([api("GET", "/me/duels"), api("GET", "/groups")]); } catch { return showError(); }

  const msg = h("p", { class: "soft", role: "alert" });
  const nameIn = h("input", { class: "field", placeholder: az.groups.namePh, maxlength: 24, "aria-label": az.groups.namePh }) as HTMLInputElement;
  const codeIn = h("input", { class: "field", placeholder: az.groups.codePh, maxlength: 8, autocapitalize: "characters", "aria-label": az.groups.codePh }) as HTMLInputElement;
  const create = h("button", { class: "btn", onclick: async () => {
    msg.textContent = "";
    try { const g = await api("POST", "/groups", { name: nameIn.value }); go(`/g/${g.code}`); }
    catch (e: any) { msg.textContent = e.code === "bad_name" ? az.groups.errName : az.common.error; }
  } }, az.groups.create);
  const join = h("button", { class: "btn", onclick: async () => {
    msg.textContent = "";
    try { const g = await api("POST", "/groups/join", { code: codeIn.value }); go(`/g/${g.code}`); }
    catch (e: any) { msg.textContent = e.code === "full" ? az.groups.full : e.status === 404 ? az.groups.notFound : az.common.error; }
  } }, az.groups.join);

  screen("duels",
    h("h1", null, az.groups.title),
    h("p", { class: "muted" }, az.groups.sub),
    groups.groups.length
      ? h("div", { class: "list" }, ...groups.groups.map((g: any) =>
          h("a", { class: "list-row", style: "--accent: var(--c-primary)", href: `/g/${g.code}`, "data-link": "" },
            icon("pass", 28),
            h("div", { class: "txt" }, h("b", null, g.name), h("span", null, [t("groups.members", { n: g.members }), t("duels.rank", { n: g.rank })].join(" · "))),
            icon("chevron", 18))))
      : h("p", { class: "muted" }, az.groups.empty),
    h("a", { class: "list-row", style: "--accent: var(--c-primary)", href: "/live", "data-link": "" },
      icon("pass", 28),
      h("div", { class: "txt" }, h("b", null, az.live.hubTitle), h("span", null, az.live.hubSub))),
    h("div", { class: "pair-input" }, nameIn, create),
    h("div", { class: "pair-input" }, codeIn, join),
    msg,
    h("h2", null, az.duels.title),
    ...(data.duels.length === 0 ? [h("p", { class: "muted" }, az.duels.empty)] : [h("div", { class: "list" }, ...data.duels.map((d: any) =>
      h("a", { class: "list-row", style: accent(d.slug), href: `/duel/${d.code}`, "data-link": "" },
        icon(d.slug, 28),
        h("div", { class: "txt" }, h("b", null, expName(d.slug)),
          h("span", null, [az.duels[d.status as "open" | "closed" | "expired"], t("duels.players", { n: d.finished }),
            d.myRank ? t("duels.rank", { n: d.myRank }) : ""].filter(Boolean).join(" · "))),
        icon("chevron", 18))))]));
}

/** One group: its code, invite buttons and the standing leaderboard. A link from a friend lands here too. */
export async function groupPage(code: string) {
  let g: any;
  try { g = await api("GET", `/groups/${code}`); }
  catch (e: any) {
    if (e.code === "not_member") {
      const err = h("p", { class: "soft", role: "alert" });
      return screen("duels",
        h("div", { style: "--accent: var(--c-primary)" }, icon("pass", 56, "ico intro-ico")),
        h("h1", null, e.data.name),
        h("p", { class: "muted" }, t("groups.members", { n: e.data.members })),
        err,
        h("button", { class: "btn primary block", onclick: async () => {
          try { await api("POST", "/groups/join", { code }); void groupPage(code); }
          catch (er: any) { err.textContent = er.code === "full" ? az.groups.full : az.common.error; }
        } }, az.groups.join));
    }
    return showError();
  }
  const url = `${location.origin}/g/${g.code}`;
  const text = t("groups.shareMsg", { code: g.code }) + " " + url;
  const copy = h("button", { class: "btn" }, az.share.copy);
  copy.addEventListener("click", async () => { await navigator.clipboard?.writeText(text).catch(() => {}); copy.textContent = az.share.copied; });
  screen("duels",
    h("h1", null, g.name),
    h("p", { class: "muted" }, [t("groups.code", { code: g.code }), t("groups.members", { n: g.members.length })].join(" · ")),
    h("div", { class: "actions" },
      h("a", { class: "btn primary block", href: `https://wa.me/?text=${encodeURIComponent(text)}`, target: "_blank", rel: "noopener" }, az.groups.invite + " · WhatsApp"),
      h("a", { class: "btn block", href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(t("groups.shareMsg", { code: g.code }))}`, target: "_blank", rel: "noopener" }, "Telegram"),
      copy),
    h("ol", { class: "lb rank" }, ...g.members.map((m: any) =>
      h("li", { class: m.isMe ? "me" : "" },
        h("span", { class: "rk" }, String(m.rank)),
        h("span", { class: "who" }, m.isMe ? `${m.nickname} (${az.groups.you})` : m.nickname,
          h("small", { class: "muted" }, [m.city ? az.cities[m.city] : "", t("ranking.played", { n: m.played, total: g.total })].filter(Boolean).join(" · "))),
        h("b", null, String(m.score))))),
    h("button", { class: "link", onclick: async () => { await api("DELETE", `/groups/${g.code}/leave`).catch(() => {}); go("/duels"); } }, az.groups.leave),
    h("a", { class: "link", href: "/duels", "data-link": "" }, az.groups.back));
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
    view === "cities" && cities.cities.some((c: any) => c.players < 5) ? h("p", { class: "muted" }, az.ranking.fewPlayers) : null,
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
    h("small", { class: "muted" }, az.ranking.notIq),
    h("p", null, t("passport.streak", { n: p.streak })),
    ...cards,
    recapSection(),
    h("h2", null, az.passport.badges),
    ...(badgeItems.length ? badgeItems : [h("p", { class: "muted" }, az.passport.noBadges)]),
    h("h2", null, az.passport.settings),
    h("div", { class: "kv-row" }, h("span", null, az.passport.language), langSwitch()),
    h("div", { class: "kv-row" }, h("span", null, az.passport.sound), soundSwitch()),
    vibrationRow(),
    remindersRow(),
    h("button", { class: "btn block", onclick: () => void import("./profile").then((m) => m.openProfileSheet(() => void passport())) }, az.profile.edit),
    h("button", { class: "btn block", onclick: async () => {
      const r = await api("PATCH", "/me", { rerollNickname: true }).catch(() => null);
      if (r && me()) (me() as any).nickname = r.user.nickname;
      void passport();
    } }, az.passport.reroll),
    recoverySection(),
    del,
    h("a", { class: "link", href: "/privacy", "data-link": "" }, az.passport.privacy));
}

function soundSwitch(): HTMLElement {
  const b = h("button", { class: "chip" + (soundOn() ? " on" : "") }, soundOn() ? az.passport.soundOn : az.passport.soundOff);
  b.addEventListener("click", () => { setSound(!soundOn()); b.classList.toggle("on", soundOn()); b.textContent = soundOn() ? az.passport.soundOn : az.passport.soundOff; });
  return b;
}

export function privacy() {
  screen("pass", h("h1", null, az.privacy.title), ...az.privacy.body.map((l) => h("p", null, l)),
    h("a", { class: "link", href: "/passport", "data-link": "" }, az.common.back));
}

