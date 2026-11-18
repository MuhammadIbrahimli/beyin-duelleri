import { VIDEOS } from "../config/videos";
import { SOURCES } from "../config/sources";
import { LOVBER_QUESTIONS } from "../config/lovber";
import { DRM_SETS } from "../config/wordsets";
import { SHORT_HOST, CHANNEL_LABEL } from "../config/brand";
import type { CardModel } from "./card/model";
import { countRun, installOffer } from "./pwa";
import { api, me, type FinishResult } from "./api";
import { burst, countUp, h, mount } from "./dom";
import { fx } from "./fx";
import { icon, mark } from "./icons";
import { az, getLang, setLang, t, type Lang } from "./i18n";
import { available, loaders } from "./experiments";
import { go } from "./router";
import { lastRun, latest, remember } from "./state";

export const app = () => document.getElementById("app")!;
const SLUGS = Object.keys(az.experiments);
export const accent = (slug: string) => `--accent: var(--c-exp-${slug})`;

/** Colours the soft glow at the top of the page with the current experiment's accent. */
export function tint(slug: string | null) {
  if (slug) document.body.style.setProperty("--tint", `var(--c-exp-${slug})`);
  else document.body.style.removeProperty("--tint");
}

function tabs(active: string) {
  const items: [string, string, string][] = [
    ["/", az.nav.experiments, "exp"], ["/duels", az.nav.duels, "duels"],
    ["/ranking", az.nav.ranking, "rank"], ["/passport", az.nav.passport, "pass"],
  ];
  return h("nav", { class: "tabs" }, h("div", null, ...items.map(([href, label, id]) =>
    h("a", { href, "data-link": "", class: id === active ? "on" : "", "aria-label": label }, icon(id), h("span", null, label)))));
}

/** AZ | RU toggle. Switching rebuilds the whole app in the other language. */
export function langSwitch(): HTMLElement {
  const btn = (l: Lang) => h("button", { class: "lang" + (getLang() === l ? " on" : ""), "aria-label": l === "az" ? "Azərbaycanca" : "Русский", onclick: async () => {
    if (getLang() === l) return;
    setLang(l);
    await api("PATCH", "/me", { lang: l }).catch(() => {});
    location.reload();
  } }, l.toUpperCase());
  return h("div", { class: "langs" }, btn("az"), btn("ru"));
}

export function screen(active: string | null, ...kids: (Node | null | false)[]) {
  tint(null);
  mount(app(), h("div", { class: "screen" }, ...(kids.filter(Boolean) as Node[])), ...(active ? [tabs(active)] : []));
}

export const showError = (retry?: () => void) =>
  screen(null, h("h1", null, az.common.error), retry ? h("button", { class: "btn primary block", onclick: retry }, az.common.retry) : null,
    h("a", { class: "link", href: "/", "data-link": "" }, az.common.back));

export const cardFooter = () => [[SHORT_HOST || location.host, CHANNEL_LABEL].filter(Boolean).join("  ·  "), az.common.notDiagnosis];

/** The card code (canvas, fonts, sheet) is a separate chunk loaded only when someone taps the button. */
export async function openCard(build: (m: typeof import("./card/model")) => { model: CardModel; kind: string }, runId?: string) {
  const [model, sheet] = await Promise.all([import("./card/model"), import("./card/sheet")]);
  const { model: m, kind } = build(model);
  sheet.openCardSheet(m, kind, `${az.app.tagline} ${location.origin}`, () => {
    if (runId) void api("POST", "/shares", { runId, channel: "card" }).catch(() => {});
  });
}
const cardButton = (build: Parameters<typeof openCard>[0], runId?: string) =>
  h("button", { class: "btn block", onclick: () => void openCard(build, runId) }, az.card.open);

const lureNote = (sec: Record<string, number>) =>
  sec.fellForLure === undefined ? ""
    : sec.fellForLure ? t("result.lureFell", { word: DRM_SETS[sec.setIndex]?.lure ?? "" }) : az.result.lureNo;

export const formatScore = (slug: string, n: number) => {
  if (slug === "eyni-rengdir") return `${n}/3`;
  const u = az.experiments[slug as keyof typeof az.experiments]?.unit;
  return u === "%" ? `${n}%` : u ? `${n} ${u}` : String(n);
};

// ---- home -------------------------------------------------------------------
export async function home() {
  const d = await api("GET", "/daily").catch(() => null);
  const startHref = d && available.includes(d.slug) ? `/play/${d.slug}?daily=1` : `/play/${available[0]}`;
  const dots = d && h("span", { class: "wk" }, ...d.week.map((x: any) =>
    h("i", { class: [x.done && "done", x.frozen && "frozen", x.today && "today"].filter(Boolean).join(" ") })));
  const dailyCard = d && h("div", { class: "hero-card", style: accent(d.slug) },
    h("span", { class: "eyebrow" }, d.weekly ? az.home.weekly : az.home.daily),
    h("div", { class: "name" }, icon(d.slug, 34), az.experiments[d.slug as keyof typeof az.experiments].name),
    h("div", { class: "streak" }, h("span", null, t("home.streak", { n: d.streak })), dots),
    h("a", { class: "btn primary block", href: startHref, "data-link": "" }, az.home.start),
    h("span", { class: d.done ? "muted" : "soft" }, d.done ? az.home.doneToday : az.home.notYet));
  screen("exp",
    h("div", { class: "top" }, mark(30), az.app.name, langSwitch()),
    h("div", null, h("h1", null, az.home.title), h("p", { class: "muted", style: "margin-top:6px" }, az.home.sub)),
    dailyCard || h("a", { class: "btn primary block", href: startHref, "data-link": "" }, az.home.start),
    h("h2", null, az.home.all),
    h("div", { class: "list" }, ...SLUGS.map((slug) => {
      const e = az.experiments[slug as keyof typeof az.experiments];
      const ready = available.includes(slug);
      return h(ready ? "a" : "div", { class: "list-row" + (ready ? "" : " off"), style: accent(slug), ...(ready ? { href: `/e/${slug}`, "data-link": "" } : {}) },
        icon(slug, 28), h("div", { class: "txt" }, h("b", null, e.name), h("span", null, ready ? e.hook : az.soon)), ready ? icon("chevron", 18) : null);
    })),
    h("p", { class: "muted" }, az.home.privacy));
}

// ---- intro ------------------------------------------------------------------
export async function intro(slug: string) {
  if (!available.includes(slug)) return go("/", true);
  const e = az.experiments[slug as keyof typeof az.experiments];
  let cb: HTMLElement | null = null;
  if (slug === "reng-ve-soz") {
    const m = await import("./experiments/reng-ve-soz");
    const box = h("input", { type: "checkbox", id: "cb", ...(m.colorBlindMode() ? { checked: "" } : {}) }) as HTMLInputElement;
    box.addEventListener("change", () => m.setColorBlindMode(box.checked));
    cb = h("label", { class: "toggle", for: "cb" }, box, az.play.colorBlind);
  }
  screen(null,
    h("div", { style: accent(slug) }, icon(slug, 64, "ico intro-ico")),
    h("h1", { style: accent(slug) + ";color:var(--accent)" }, e.name),
    h("p", { style: "font-size:1.125rem" }, e.hook),
    h("p", { class: "muted" }, e.measure),
    cb,
    h("a", { class: "btn primary block", href: `/play/${slug}`, "data-link": "" }, az.common.start),
    !!VIDEOS[slug] && h("a", { class: "link", href: VIDEOS[slug], target: "_blank", rel: "noopener" }, az.intro.watch),
    h("a", { class: "link", href: "/", "data-link": "" }, az.common.back));
  tint(slug);
}

// ---- play -------------------------------------------------------------------
export async function play(slug: string, q: URLSearchParams) {
  const loader = loaders[slug];
  if (!loader) return go("/", true);
  const duelCode = q.get("d");
  let run: { runId: string; schedule: unknown };
  try {
    tint(slug);
    mount(app(), h("div", { class: "screen full" }, h("div", { class: "loader", role: "status", "aria-label": az.common.loading })));
    run = await api("POST", "/runs/start", { slug, lang: getLang(), ...(duelCode ? { duelCode } : q.get("daily") ? { daily: true } : {}) });
  } catch (e: any) {
    if (duelCode) return go(`/d/${duelCode}`, true);
    return showError(() => go(location.pathname + location.search, true));
  }
  const mod = await loader();
  const root = app();
  const payload = await mod.default(root, run.schedule);
  try {
    const res: FinishResult = await api("POST", `/runs/${run.runId}/finish`, { payload });
    remember(res);
    if (res.valid) countRun();
    if (res.duel) return go(`/duel/${res.duel.code}`, true);
    if (q.get("rematch") && res.valid) return go("/invite", true);
    go("/result", true);
  } catch {
    showError(() => go("/", true));
  }
}

// ---- result -----------------------------------------------------------------
export function result() {
  const r = latest;
  if (!r) return go("/", true);
  const slug = r.slug;
  const e = az.experiments[slug as keyof typeof az.experiments];
  const levelName = r.level ? az.result.levels[slug]?.[r.level - 1] : "";
  const src = SOURCES[slug]?.url;
  const sec = r.secondary;
  const rawText = formatScore(slug, r.primary);
  const facts = [
    t("result.raw", { v: rawText }),
    sec.earlyTaps !== undefined && t("result.secondary.earlyTaps", { n: sec.earlyTaps }),
    sec.interference !== undefined && t("result.secondary.interference", { n: sec.interference }),
    slug === "reng-ve-soz" && sec.errors !== undefined && t("result.secondary.errors", { n: sec.errors }),
    slug === "eyni-rengdir" && t("result.fooled", { n: r.primary }),
    slug === "yalanci-yaddas" && lureNote(sec),
  ].filter(Boolean) as string[];
  const lq = slug === "lovber" ? LOVBER_QUESTIONS[sec.qIndex] : undefined;
  const collective = h("p", { class: "muted" });
  if (lq) {
    void api("GET", `/lovber/stats?question=${lq.id}`).then((st) => {
      if (st.ready) collective.textContent = t("result.lovberCollective", { low: st.low, high: st.high, unit: az.lovber.units[lq.unit] ?? "" }).trim();
    }).catch(() => {});
  }
  const compare = lq ? t("result.lovberLine", { anchor: sec.anchor, answer: sec.answer, unit: az.lovber.units[lq.unit] ?? "", truth: lq.truth })
    : r.percentile === null ? az.result.compareFirst : t(`result.compare.${slug}`, { pct: r.percentile });

  const heroEl = h("div", { class: "hero" }, String(r.points));
  const panel = h("div", { class: "panel", style: accent(slug) },
    h("div", { class: "nick" }, me()?.nickname ?? ""),
    h("div", { class: "nick", style: "display:flex;align-items:center;gap:6px;color:var(--accent)" }, icon(slug, 18), e.name),
    r.level && h("div", { class: "level" },
      h("div", { class: "pips" }, ...[1, 2, 3, 4].map((i) => h("i", { class: i <= r.level! ? "on" : "" }))),
      h("span", null, `${t("result.level", { n: r.level })} · ${levelName}`)),
    h("div", { class: "hero-wrap" }, heroEl, h("span", { class: "unit" }, az.result.points)),
    !!lq && h("p", { class: "muted" }, az.result.lovberDiff),
    r.valid && r.percentile !== null && h("div", { class: "bar", style: `--v:${r.percentile / 100}` }, h("i")),
    r.valid ? h("p", null, compare) : h("div", { class: "notice" }, az.result.invalid),
    !!lq && collective,
    facts.length ? h("div", { class: "facts" }, ...facts.map((f) => h("span", null, f))) : null);
  const overall = r.valid && r.overall && h("div", { class: "mini" },
    h("div", null, h("b", null, t("result.overall", { n: r.overall.score })), h("span", { class: "muted" }, t("result.overallSub", { played: r.overall.played, total: r.overall.total }))),
    h("div", { class: "bar", style: `--v:${r.overall.played / r.overall.total}` }, h("i")),
    h("small", { class: "muted" }, az.ranking.notIq));

  screen(null,
    panel,
    overall,
    h("div", { class: "actions" },
      r.valid && h("a", { class: "btn primary block", href: "/invite", "data-link": "" }, az.result.callFriend),
      !r.valid && h("a", { class: "btn primary block", href: `/play/${slug}`, "data-link": "" }, az.result.again),
      h("div", { class: "pair" },
        r.valid ? cardButton((m) => ({
          kind: "result",
          model: m.resultCard({
            slug, brand: az.app.name, nickname: me()?.nickname ?? "", experiment: e.name,
            level: r.level ? `${t("result.level", { n: r.level })} · ${levelName}` : null,
            score: `${r.points} ${az.result.points}`, compare,
            extra: [t("result.raw", { v: rawText }), ...(slug === "yalanci-yaddas" ? [lureNote(sec)] : slug === "eyni-rengdir" ? [t("result.fooled", { n: r.primary })] : [])],
            footer: cardFooter(),
          }),
        }), r.runId) : null,
        h("a", { class: "btn block", href: "/", "data-link": "" }, az.common.otherExperiment)),
      slug === "yaddas-zenciri" && h("a", { class: "btn block", href: "/qrupla", "data-link": "" }, az.result.qrupla)),
    h("details", null,
      h("summary", null, az.result.science),
      h("p", null, az.science[slug]),
      src && src.startsWith("http")
        ? h("a", { class: "muted", href: src, target: "_blank", rel: "noopener" }, az.result.source)
        : h("p", { class: "muted" }, az.result.sourcePending)),
    installOffer(),
    h("p", { class: "muted" }, az.common.notDiagnosis),
    slug === "refleks" && h("p", { class: "muted" }, az.duel.deviceNote));
  tint(slug);
  countUp(heroEl, r.points, (n) => String(n));
  if (r.valid && r.level === 4) setTimeout(() => { burst(panel); fx.win(); }, 350);
  // optional profile (name, city, email): offered once, right after the first finished result
  if (r.valid && !me()?.profileDone) setTimeout(() => void import("./profile").then((m) => m.openProfileSheet(() => result())), 1500);
}

// ---- invite a friend (create duel) -------------------------------------------
export async function invite(q: URLSearchParams) {
  const r = latest;
  if (!r || !r.valid) return go("/", true);
  const group = q.get("type") === "group";
  let duel: { code: string; url: string };
  try {
    duel = await api("POST", "/duels", { runId: r.runId, type: group ? "group" : "1v1" });
  } catch {
    return showError(() => go("/result", true));
  }
  const name = az.experiments[r.slug as keyof typeof az.experiments].name;
  const text = group ? az.share.groupMessage
    : az.share.custom[r.slug] ?? t("share.message", { name, score: formatScore(r.slug, r.primary) });
  const full = `${text} ${duel.url}`;
  const track = (channel: string) => void api("POST", "/shares", { runId: r.runId, channel }).catch(() => {});
  const copy = h("button", { class: "btn block" }, az.share.copy);
  copy.addEventListener("click", async () => {
    await navigator.clipboard?.writeText(full).catch(() => {});
    copy.textContent = az.share.copied;
    track("copy");
  });
  const ig = h("button", { class: "btn block" }, az.share.instagram);
  ig.addEventListener("click", async () => {
    track("instagram");
    if (navigator.share) await navigator.share({ text, url: duel.url }).catch(() => {});
    else await navigator.clipboard?.writeText(full).catch(() => {});
  });
  const ext = (label: string, href: string, ch: string) =>
    h("a", { class: "btn block", href, target: "_blank", rel: "noopener", onclick: () => track(ch) }, label);
  screen(null,
    h("h1", null, group ? az.share.groupTitle : az.share.title),
    h("p", { class: "muted" }, az.share.intro),
    h("div", { class: "notice" }, text),
    h("div", { class: "actions" },
      ext(az.share.whatsapp, `https://wa.me/?text=${encodeURIComponent(full)}`, "whatsapp"),
      ext(az.share.telegram, `https://t.me/share/url?url=${encodeURIComponent(duel.url)}&text=${encodeURIComponent(text)}`, "telegram"),
      ig, copy),
    h("a", { class: "link", href: "/result", "data-link": "" }, az.common.back),
    h("a", { class: "link", href: `/duel/${duel.code}`, "data-link": "" }, az.invite.seeResult));
}

// ---- invite page (friend opens the link) --------------------------------------
export async function invitePage(code: string) {
  let d: any;
  try { d = await api("GET", `/duels/${code}`); } catch { return showError(); }
  const slug: string = d.slug;
  if (d.isCreator || d.joined) return go(`/duel/${code}`, true);
  const e = az.experiments[slug as keyof typeof az.experiments];
  const blocked = d.status === "expired" ? az.invite.expired : d.status === "closed" ? az.invite.closed : null;
  screen(null,
    h("div", { style: accent(slug) }, icon(slug, 56, "ico intro-ico")),
    h("h2", { style: accent(slug) + ";color:var(--accent)" }, e.name),
    h("h1", null, t("invite.title", { nick: d.creator.nickname })),
    blocked ? h("div", { class: "notice" }, blocked) : h("p", { class: "muted" }, az.invite.hidden),
    blocked
      ? h("a", { class: "btn primary block", href: "/", "data-link": "" }, az.common.otherExperiment)
      : h("a", { class: "btn primary block", href: `/play/${slug}?d=${code}`, "data-link": "" }, az.invite.accept));
  tint(slug);
}

// ---- duel result ---------------------------------------------------------------
export async function duelResult(code: string) {
  let r: any;
  try {
    r = await api("GET", `/duels/${code}/result`);
  } catch (e: any) {
    if (e.code === "finish_first") return go(`/d/${code}`, true);
    return showError();
  }
  const slug: string = r.slug;
  const meE = r.entries.find((x: any) => x.isMe);
  const other = r.entries.find((x: any) => !x.isMe);
  const mine = lastRun[slug];
  const head =
    r.type === "group" ? az.duel.groupRank
    : !other ? az.invite.waiting
    : r.outcome === "win" ? az.duel.winYou : r.outcome === "lose" ? t("duel.winOther", { nick: other.nickname }) : az.duel.tie;

  const body = r.type === "group" || !other
    ? h("ul", { class: "lb" }, ...r.entries.map((x: any) =>
        h("li", { class: x.isMe ? "me" : "" }, h("span", null, `${x.rank}. ${x.isMe ? az.duel.you : x.nickname}`), h("b", null, formatScore(slug, x.primary)),
        slug === "yalanci-yaddas" ? h("small", { class: "muted" }, lureNote(x.secondary)) : null)))
    : h("div", { class: "vs" },
        ...[meE, other].map((x: any) => h("div", { class: x.rank === 1 && r.outcome !== "tie" ? "win" : "" },
          h("span", { class: "nick" }, x.isMe ? az.duel.you : x.nickname),
          h("div", { class: "hero", style: accent(slug) + ";font-size:2.25rem" }, formatScore(slug, x.primary)),
          slug === "yalanci-yaddas" ? h("small", { class: "muted" }, lureNote(x.secondary)) : null)));

  const canGroup = r.type === "1v1" && !!mine;
  const won = r.type === "1v1" && r.outcome === "win";
  screen(null,
    h("h2", { style: accent(slug) + ";color:var(--accent)" }, az.experiments[slug as keyof typeof az.experiments].name),
    h("h1", null, head), body,
    !other && h("a", { class: "btn primary block", href: "/invite", "data-link": "" }, az.share.title),
    other && h("a", { class: "btn primary block", href: `/play/${slug}?rematch=1`, "data-link": "" }, az.duel.rematch),
    !!other && cardButton((m) => {
      const experiment = az.experiments[slug as keyof typeof az.experiments].name;
      if (r.type === "group") {
        return { kind: "group", model: m.groupCard({ slug, brand: az.app.name, experiment, title: az.duel.groupRank, footer: cardFooter(),
          rows: r.entries.map((x: any) => ({ rank: x.rank, name: x.isMe ? az.duel.you : x.nickname, value: formatScore(slug, x.primary), me: x.isMe })) }) };
      }
      const win = (x: any) => x.rank === 1 && r.outcome !== "tie";
      return { kind: "duel", model: m.duelCard({ slug, brand: az.app.name, experiment, title: head, footer: cardFooter(),
        left: { label: az.duel.you, value: formatScore(slug, meE.primary), win: win(meE) },
        right: { label: other.nickname, value: formatScore(slug, other.primary), win: win(other) } }) };
    }, mine?.runId),
    canGroup && h("a", { class: "btn block", href: "/invite?type=group", "data-link": "" }, az.duel.group),
    h("a", { class: "btn block", href: "/", "data-link": "" }, az.common.otherExperiment),
    slug === "refleks" && h("p", { class: "muted" }, az.duel.deviceNote),
    h("p", { class: "muted" }, az.common.notDiagnosis));
  tint(slug);
  if (won) setTimeout(() => { fx.win(); const w = document.querySelector(".vs .win") as HTMLElement | null; if (w) burst(w); }, 300);
}


