// Beyin duellisi on the client: the home screen, the search for an opponent, the VS card and the result of a match.
// The match itself is played in the room (src/room.ts); the server decides every result and reward.
import "./duel5.css";
import "./game2.css";
import { api, me } from "./api";
import { countUp, h } from "./dom";
import { shareButton } from "./share";
import { az, t } from "./i18n";
import { go, onLeave } from "./router";
import { screen } from "./screens";

type Player = { id: string | null; nick: string; rating: number | null; league: string | null; bot: boolean; level?: string; avatar?: string | null };
const BOT_LEVELS = ["asan", "orta", "cetin", "ekspert"] as const;
type BotLevelId = (typeof BOT_LEVELS)[number];

const NS = "http://www.w3.org/2000/svg";
function svgEl(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** One original emblem per league: a different outline and colour for each step. Plain SVG, a few hundred bytes. */
const LEAGUE_ART: Record<string, { color: string; d: string }> = {
  burunc: { color: "#c98a52", d: "M24 4 L40 10 V24 C40 34 33 41 24 44 C15 41 8 34 8 24 V10 Z" },
  gumus: { color: "#c9d3e0", d: "M24 4 L40 24 L24 44 L8 24 Z" },
  qizil: { color: "#ffd23f", d: "M7 34 L4 14 L16 24 L24 9 L32 24 L44 14 L41 34 Z" },
  platin: { color: "#7fe3d4", d: "M24 4 L41 14 V34 L24 44 L7 34 V14 Z" },
  almaz: { color: "#6ad4f5", d: "M14 8 H34 L42 18 L24 42 L6 18 Z" },
  ustad: { color: "#b394ff", d: "M24 3 L30 17 L45 18 L33 27 L37 43 L24 34 L11 43 L15 27 L3 18 L18 17 Z" },
  efsane: { color: "#ff6b95", d: "M24 4 C30 14 40 18 40 30 A16 16 0 0 1 8 30 C8 20 16 16 18 8 C20 14 22 16 24 4 Z" },
};

const leagueName = (id: string | null) => (id && (az.duel5.leagues as Record<string, string>)[id]) || "";

export function leagueBadge(id: string, size = 56): SVGElement {
  const art = LEAGUE_ART[id] ?? LEAGUE_ART.burunc;
  const svg = svgEl("svg", { viewBox: "0 0 48 48", width: size, height: size, class: "d5-badge", role: "img", "aria-label": leagueName(id) });
  svg.append(svgEl("path", { d: art.d, fill: art.color, stroke: "rgba(0,0,0,0.35)", "stroke-width": 1.5, "stroke-linejoin": "round" }));
  return svg;
}

function hue(s: string): number {
  let x = 0;
  for (const c of s) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  return x % 360;
}

export function avatar(nick: string, bot = false): HTMLElement {
  const letter = bot ? "B" : (nick.trim().charAt(0) || "?").toUpperCase();
  return h("span", { class: "d5-avatar", style: `width:56px;height:56px;background:hsl(${hue(nick || "?")} 65% 58%)`, "aria-hidden": "true" }, letter);
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

function errText(code?: string): string {
  if (code === "busy") return az.duel5.busy;
  if (code === "no_recent_match") return az.duel5.noRecent;
  return az.duel5.unavailable;
}

/** The league card: badge, rating, and how far the player is from the next league. The thresholds come from the server. */
function leagueCard(r: { rating: number; league: string; leagues: { id: string; min: number }[] }): HTMLElement {
  const idx = r.leagues.findIndex((l) => l.id === r.league);
  const cur = r.leagues[Math.max(0, idx)];
  const next = r.leagues[idx + 1];
  const span = next ? next.min - cur.min : 1;
  const into = next ? (r.rating - cur.min) / span : 1;
  const explain = h("p", { class: "d5-info-body", hidden: true }, az.duel5.ratingBody);
  const toggle = h("button", { class: "d5-info", "aria-expanded": "false", onclick: () => {
    explain.hidden = !explain.hidden;
    toggle.setAttribute("aria-expanded", String(!explain.hidden));
  } }, az.duel5.ratingHow);
  return h("section", { class: "d5-league" },
    leagueBadge(r.league, 64),
    h("div", { class: "d5-league-meta" },
      h("span", { class: "eyebrow" }, az.duel5.league),
      h("b", null, leagueName(r.league)),
      h("span", null, `${az.duel5.rating}: ${r.rating}`),
      h("div", { class: "d5-league-bar", style: `--v:${Math.min(1, Math.max(0, into)).toFixed(3)}` }, h("i")),
      h("small", { class: "muted" }, next ? t("duel5.toNext", { n: next.min - r.rating }) : az.duel5.topLeague),
      toggle),
    explain);
}

async function friendMatch(ev: Event) {
  const btn = ev.currentTarget as HTMLButtonElement;
  btn.disabled = true;
  try {
    const r = await api<{ code: string }>("POST", "/matches/friend");
    go(`/r/${r.code}`);
  } catch {
    btn.disabled = false;
  }
}

/** The main screen: the account, the league, the one big button, the other modes and the last matches. */
export async function duelHome() {
  const [econ, rate, daily, mine] = await Promise.all([
    api("GET", "/economy/me").catch(() => null),
    api("GET", "/ratings/me").catch(() => null),
    api("GET", "/daily").catch(() => null),
    api("GET", "/matches/mine").catch(() => null),
  ]);
  const nick = me()?.nickname ?? "";
  const xpPct = econ && econ.need ? econ.into / econ.need : 0;
  const top = h("div", { class: "d5-top" },
    avatar(nick),
    h("div", { class: "d5-who" }, h("b", null, nick || "—"), h("span", { class: "muted" }, econ ? t("duel5.level", { n: econ.level }) : "")),
    h("span", { class: "d5-gold" }, `${econ?.qizil ?? 0} ${az.duel5.gold}`),
    h("div", { class: "d5-xp", style: `--v:${xpPct.toFixed(3)}`, role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(xpPct * 100) }, h("i")));
  const league = rate ? leagueCard(rate) : null;
  const cta = h("button", { class: "d5-cta", onclick: () => go("/match/search") },
    h("b", null, az.duel5.cta),
    h("small", null, az.duel5.ctaSub));
  const modes = h("div", { class: "d5-modes" },
    h("button", { class: "d5-mode", onclick: friendMatch }, h("b", null, az.duel5.friend), h("small", null, az.duel5.friendSub)),
    h("a", { class: "d5-mode", href: "/train", "data-link": "" }, h("b", null, az.duel5.train), h("small", null, az.duel5.trainSub)),
    h("a", { class: "d5-mode", href: "/marafon", "data-link": "" }, h("b", null, az.game2.marafon.title), h("small", null, az.game2.marafon.start)),
    daily ? h("a", { class: "d5-mode", href: `/play/${daily.slug}?daily=1`, "data-link": "" },
      h("b", null, az.duel5.daily),
      h("small", null, az.experiments[daily.slug as keyof typeof az.experiments]?.name ?? "")) : null);
  const recent = mine?.matches?.length
    ? h("div", { class: "d5-recent" }, ...mine.matches.slice(0, 3).map((m: any) => h("div", { class: "d5-row" },
        h("span", null, `${m.points[0]} : ${m.points[1]} · ${m.opponentBot ? az.duel5.vsBot : m.rated ? az.duel5.rated : az.duel5.friendly}`),
        h("span", { class: "d5-pill " + (m.draw ? "" : m.won ? "won" : "lost") }, m.draw ? az.duel5.draw : m.won ? az.duel5.won : az.duel5.lost))))
    : h("p", { class: "soft" }, az.duel5.noMatches);
  const extras = await import("./game2").then((g) => g.homeExtras()).catch(() => null);
  const g3 = await import("./game3").then((g) => g.homeBlocks()).catch(() => null);
  const dailyLink = h("a", { class: "g2-link", href: "/daily-board", "data-link": "" }, az.game3.daily.title);
  screen("home", top, g3, league, cta, modes, dailyLink, extras, h("h2", null, az.duel5.recent), recent);
}

/** Search for an opponent: the server pairs by rating; a bot is only offered after a wait, and is labelled as a bot. */
export function duelSearch(rematchWith: string | null) {
  let finished = false;
  let ws: WebSocket | null = null;
  const status = h("p", { class: "d5-status", role: "status", "aria-live": "polite" }, az.duel5.searching);
  const clock = h("span", { class: "d5-clock", "aria-live": "off" }, "");
  const offer = h("div", { class: "d5-offer", hidden: true });
  const retry = h("button", { class: "btn primary block", hidden: true, onclick: () => {
    retry.hidden = true;
    status.textContent = az.duel5.searching;
    open();
  } }, az.duel5.retry);
  const cancel = h("button", { class: "btn block", onclick: () => {
    finished = true;
    send({ t: "cancel" });
    ws?.close();
    go("/");
  } }, az.duel5.cancel);
  const rings = h("div", { class: "d5-rings", "aria-hidden": "true" }, h("i"), h("i"), h("i"), avatar(me()?.nickname ?? ""));
  screen(null, h("div", { class: "d5-search" }, h("h1", null, rematchWith ? az.duel5.rematch : az.duel5.searchTitle), rings, status, clock, offer, retry, cancel));
  onLeave(() => {
    finished = true;
    ws?.close();
  });

  const send = (o: Record<string, unknown>) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o));
  };

  function showOffer() {
    offer.hidden = false;
    status.textContent = az.duel5.botOffer;
    offer.replaceChildren(
      h("p", { class: "soft" }, az.duel5.pickBot),
      h("div", { class: "d5-levels" }, ...BOT_LEVELS.map((lvl: BotLevelId) => h("button", { class: "btn", onclick: () => {
        send({ t: "bot", level: lvl });
        offer.hidden = true;
        status.textContent = az.duel5.matchReady;
      } }, az.duel5.bots[lvl]))),
      h("button", { class: "btn block", onclick: () => {
        offer.hidden = true;
        status.textContent = az.duel5.searching;
      } }, az.duel5.keepSearch));
  }

  function onMsg(m: any) {
    switch (m.t) {
      case "ready":
        if (rematchWith) {
          status.textContent = az.duel5.rematchWait;
          send({ t: "rematch", opponent: rematchWith });
        } else {
          send({ t: "queue" });
        }
        return;
      case "queued":
        return;
      case "searching":
        clock.textContent = t("duel5.waited", { s: Math.floor(Number(m.waited) / 1000) });
        return;
      case "bot_offer":
        showOffer();
        return;
      case "timeout":
        status.textContent = az.duel5.timeout;
        showOffer();
        retry.hidden = false;
        return;
      case "rematch_wait":
        status.textContent = az.duel5.rematchWait;
        return;
      case "matched":
        finished = true;
        ws?.close();
        showVs(m);
        return;
      case "error":
        status.textContent = errText(m.code);
        retry.hidden = false;
        return;
      default:
        return;
    }
  }

  function open() {
    const token = localStorage.getItem("bd_token");
    const sock = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/mm/ws`);
    ws = sock;
    sock.onopen = () => sock.send(JSON.stringify({ t: "hello", token }));
    sock.onmessage = (e) => onMsg(JSON.parse(String(e.data)));
    sock.onclose = () => {
      if (finished || sock !== ws) return;
      status.textContent = az.duel5.connLost;
      retry.hidden = false;
    };
  }

  open();
}

/** The short VS screen before the room opens: both players, their leagues and ratings. Remembers the opponent for a rematch. */
function showVs(m: { code: string; mode: string; me: Player; opponent: Player }) {
  sessionStorage.setItem("bd_match", JSON.stringify({ code: m.code, opp: m.opponent.id, bot: m.opponent.bot, mode: m.mode }));
  const side = (p: Player, right: boolean) => h("div", { class: "d5-vs-side" + (right ? " right" : "") },
    p.avatar ? h("span", { class: "d5-avatar", style: "width:84px;height:84px;background:transparent" }, h("span", { class: "g2-look " + p.avatar, style: "width:84px;height:84px" })) : avatar(p.nick, p.bot),
    h("b", null, p.nick),
    p.bot ? h("span", { class: "d5-bot-tag" }, "BOT") : null,
    p.league ? leagueBadge(p.league, 40) : null,
    h("span", { class: "muted" }, p.rating != null ? `${az.duel5.rating} ${p.rating}` : ""));
  const node = h("div", { class: "d5-vs-screen" },
    h("p", { class: "soft" }, az.duel5.matchReady),
    h("div", { class: "d5-vs" }, side(m.me, false), h("div", { class: "d5-vs-mark" }, az.duel5.vs), side(m.opponent, true)),
    h("button", { class: "btn primary block", onclick: () => go(`/r/${m.code}`) }, az.duel5.start));
  screen(null, node);
  const timer = setTimeout(() => go(`/r/${m.code}`), 3200);
  onLeave(() => clearTimeout(timer));
}

export interface EndOpts {
  code: string;
  mode: string;
  slot: number | null;
  winner: number;
  reason: string;
  points: [number, number];
  history: { id: string; winner: number; score: number[] }[];
  nicks: [string, string];
  opp: string | null;
  oppIsBot: boolean;
}

/** The result of a finished match. The rating and rewards are stored a moment later on the server, so they are fetched after a short wait. */
export function matchEndPanel(o: EndOpts): HTMLElement {
  const mine = o.slot ?? 0;
  const other = mine === 0 ? 1 : 0;
  const won = o.slot !== null && o.winner === o.slot;
  const draw = o.winner === -1;
  const title = draw ? az.duel5.drawTitle : won ? az.duel5.winTitle : az.duel5.loseTitle;
  const score = `${o.points[mine]} : ${o.points[other]}`;
  const stageName = (id: string) => (az.duel5.stageNames as Record<string, string>)[id] ?? id;
  const list = h("ul", { class: "d5-stage-list" }, ...o.history.map((st) => h("li", null,
    h("span", null, stageName(st.id)),
    h("span", { class: "d5-pill " + (st.winner === -1 ? "" : st.winner === mine ? "won" : "lost") },
      st.winner === -1 ? az.duel5.draw : st.winner === mine ? az.duel5.won : az.duel5.lost))));
  const ratingLine = h("p", { class: "soft", "aria-live": "polite" }, "");
  const gains = h("div", { class: "d5-gains" });
  const canRematch = !o.oppIsBot && !!o.opp && (o.mode === "rated" || o.mode === "friendly");
  const actions = h("div", { class: "d5-actions" },
    h("button", { class: "btn primary block", onclick: () => go("/match/search") }, az.duel5.playAgain),
    canRematch ? h("button", { class: "btn block", onclick: () => go(`/match/search?rematch=${encodeURIComponent(o.opp!)}`) }, az.duel5.rematch) : null,
    shareButton(() => ({ kicker: "Beyin duellisi", title: `${o.nicks[mine]} — ${o.nicks[other]}`, big: score, lines: [title, o.reason === "forfeit" ? az.duel5.forfeit : ""].filter(Boolean) }), { button: az.duel5.share, saved: az.game3.share.saved }),
    h("button", { class: "btn block", onclick: () => go("/") }, az.duel5.home));
  void fillResult(o.code, o.mode, ratingLine, gains);
  return h("div", { class: "d5-end" },
    h("p", { class: "d5-end-title" }, title),
    h("div", { class: "d5-end-score", "aria-label": score }, score),
    o.reason === "forfeit" ? h("p", { class: "soft" }, az.duel5.forfeit) : null,
    list,
    ratingLine,
    gains,
    actions);
}

async function fillResult(code: string, mode: string, ratingLine: HTMLElement, gains: HTMLElement) {
  for (const wait of [900, 1600, 2600]) {
    await new Promise((r) => setTimeout(r, wait));
    const mine = await api("GET", "/matches/mine").catch(() => null);
    const row = mine?.matches?.find((x: any) => x.id === code);
    if (!row) continue;
    ratingLine.textContent = row.rated ? t("duel5.ratingDelta", { n: signed(row.delta) }) : mode === "training" ? "" : az.duel5.unrated;
    const xpEl = h("span", null, "");
    countUp(xpEl, row.xp, (n) => t("duel5.xpGain", { n }));
    gains.replaceChildren(xpEl, ...(row.qizil > 0 ? [h("span", null, t("duel5.goldGain", { n: row.qizil }))] : []));
    return;
  }
}
