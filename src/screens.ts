import { VIDEOS } from "../config/videos";
import { SOURCES } from "../config/sources";
import { LOVBER_QUESTIONS } from "../config/lovber";
import { DRM_SETS } from "../config/wordsets";
import { SHORT_HOST, CHANNEL_LABEL } from "../config/brand";
import type { CardModel } from "./card/model";
import { api, me, type FinishResult } from "./api";
import { h, mount } from "./dom";
import { az, t } from "./i18n/az";
import { available, loaders } from "./experiments";
import { go } from "./router";
import { lastRun, latest, remember } from "./state";

const app = () => document.getElementById("app")!;
const SLUGS = Object.keys(az.experiments);
const accent = (slug: string) => `--accent: var(--c-exp-${slug})`;

function tabs(active: string) {
  const items: [string, string, string][] = [
    ["/", az.nav.experiments, "exp"], ["/soon", az.nav.duels, "duels"],
    ["/soon", az.nav.ranking, "rank"], ["/soon", az.nav.passport, "pass"],
  ];
  return h("nav", { class: "tabs" }, h("div", null, ...items.map(([href, label, id]) =>
    h("a", { href, "data-link": "", class: id === active ? "on" : "" }, label))));
}

function screen(active: string | null, ...kids: (Node | null | false)[]) {
  mount(app(), h("div", { class: "screen" }, ...(kids.filter(Boolean) as Node[])), ...(active ? [tabs(active)] : []));
}

const showError = (retry?: () => void) =>
  screen(null, h("h1", null, az.common.error), retry ? h("button", { class: "btn primary block", onclick: retry }, az.common.retry) : null,
    h("a", { class: "link", href: "/", "data-link": "" }, az.common.back));

const cardFooter = () => [[SHORT_HOST || location.host, CHANNEL_LABEL].filter(Boolean).join("  ·  "), az.common.notDiagnosis];

/** The card code (canvas, fonts, sheet) is a separate chunk loaded only when someone taps the button. */
async function openCard(build: (m: typeof import("./card/model")) => { model: CardModel; kind: string }, runId?: string) {
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

const formatScore = (slug: string, n: number) => {
  if (slug === "eyni-rengdir") return `${n}/3`;
  const u = az.experiments[slug as keyof typeof az.experiments]?.unit;
  return u === "%" ? `${n}%` : u ? `${n} ${u}` : String(n);
};

// ---- home -------------------------------------------------------------------
export async function home() {
  const info = await api("GET", "/experiments").catch(() => null);
  const daily: string | undefined = info?.daily?.slug;
  const startHref = daily && available.includes(daily) ? `/play/${daily}?daily=1` : `/play/${available[0]}`;
  screen("exp",
    h("h1", null, az.home.title),
    h("p", { class: "muted" }, az.home.sub),
    h("a", { class: "btn primary block", href: startHref, "data-link": "" }, az.home.start),
    h("h2", null, az.home.all),
    ...SLUGS.map((slug) => {
      const e = az.experiments[slug as keyof typeof az.experiments];
      const ready = available.includes(slug);
      return h(ready ? "a" : "div", { class: "card", style: accent(slug), ...(ready ? { href: `/e/${slug}`, "data-link": "" } : {}) },
        h("b", null, e.name), h("span", { class: "muted" }, ready ? e.hook : az.soon));
    }),
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
    cb = h("label", { class: "check", for: "cb" }, box, az.play.colorBlind);
  }
  screen(null,
    h("h1", { style: accent(slug) + ";color:var(--accent)" }, e.name),
    h("p", null, e.hook),
    h("p", { class: "muted" }, e.measure),
    cb,
    h("a", { class: "btn primary block", href: `/play/${slug}`, "data-link": "" }, az.common.start),
    !!VIDEOS[slug] && h("a", { class: "link", href: VIDEOS[slug], target: "_blank", rel: "noopener" }, az.intro.watch),
    h("a", { class: "link", href: "/", "data-link": "" }, az.common.back));
}

// ---- play -------------------------------------------------------------------
export async function play(slug: string, q: URLSearchParams) {
  const loader = loaders[slug];
  if (!loader) return go("/", true);
  const duelCode = q.get("d");
  let run: { runId: string; schedule: unknown };
  try {
    mount(app(), h("div", { class: "screen" }, h("p", { class: "muted" }, az.common.loading)));
    run = await api("POST", "/runs/start", { slug, ...(duelCode ? { duelCode } : q.get("daily") ? { daily: true } : {}) });
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
  const secLines = [
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
      if (st.ready) collective.textContent = t("result.lovberCollective", { low: st.low, high: st.high });
    }).catch(() => {});
  }

  screen(null,
    h("div", { class: "nick" }, me()?.nickname ?? ""),
    h("h2", null, e.name),
    r.level && h("div", { class: "level" }, `${t("result.level", { n: r.level })} · ${levelName}`),
    !!lq && h("p", null, t("result.lovberLine", { anchor: sec.anchor, answer: sec.answer, unit: lq.unit, truth: lq.truth })),
    h("div", { class: "hero", style: accent(slug) }, formatScore(slug, r.primary)),
    !!lq && h("p", { class: "muted" }, az.result.lovberDiff),
    !!lq && collective,
    ...secLines.map((l) => h("p", { class: "muted" }, l)),
    r.valid
      ? h("p", null, r.percentile === null ? az.result.compareFirst : t(`result.compare.${slug}`, { pct: r.percentile }))
      : h("div", { class: "notice" }, az.result.invalid),
    r.valid && h("a", { class: "btn primary block", href: "/invite", "data-link": "" }, az.result.callFriend),
    !r.valid && h("a", { class: "btn primary block", href: `/play/${slug}`, "data-link": "" }, az.result.again),
    r.valid && cardButton((m) => ({
      kind: "result",
      model: m.resultCard({
        slug, brand: az.app.name, nickname: me()?.nickname ?? "", experiment: e.name,
        level: r.level ? `${t("result.level", { n: r.level })} · ${levelName}` : null,
        score: formatScore(slug, r.primary),
        compare: lq ? t("result.lovberLine", { anchor: sec.anchor, answer: sec.answer, unit: lq.unit, truth: lq.truth })
          : r.percentile === null ? az.result.compareFirst : t(`result.compare.${slug}`, { pct: r.percentile }),
        extra: slug === "yalanci-yaddas" ? [lureNote(sec)] : slug === "eyni-rengdir" ? [t("result.fooled", { n: r.primary })] : [],
        footer: cardFooter(),
      }),
    }), r.runId),
    slug === "yaddas-zenciri" && h("a", { class: "btn block", href: "/qrupla", "data-link": "" }, az.result.qrupla),
    h("a", { class: "btn block", href: "/", "data-link": "" }, az.common.otherExperiment),
    h("details", null,
      h("summary", null, az.result.science),
      h("p", null, az.science[slug]),
      src && src.startsWith("http")
        ? h("a", { class: "muted", href: src, target: "_blank", rel: "noopener" }, az.result.source)
        : h("p", { class: "muted" }, az.result.sourcePending)),
    h("p", { class: "muted" }, az.common.notDiagnosis),
    slug === "refleks" && h("p", { class: "muted" }, az.duel.deviceNote));
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
    ext(az.share.whatsapp, `https://wa.me/?text=${encodeURIComponent(full)}`, "whatsapp"),
    ext(az.share.telegram, `https://t.me/share/url?url=${encodeURIComponent(duel.url)}&text=${encodeURIComponent(text)}`, "telegram"),
    ig, copy,
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
    h("h2", { style: accent(slug) + ";color:var(--accent)" }, e.name),
    h("h1", null, t("invite.title", { nick: d.creator.nickname })),
    blocked ? h("div", { class: "notice" }, blocked) : h("p", null, az.invite.hidden),
    blocked
      ? h("a", { class: "btn primary block", href: "/", "data-link": "" }, az.common.otherExperiment)
      : h("a", { class: "btn primary block", href: `/play/${slug}?d=${code}`, "data-link": "" }, az.invite.accept));
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
}

export function soon() {
  screen("duels", h("h1", null, az.soon), h("a", { class: "link", href: "/", "data-link": "" }, az.common.back));
}
