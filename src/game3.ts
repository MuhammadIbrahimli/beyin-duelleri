// Client for: streak rewards, notifications, friend extras (history, reactions, team invitations), the skill chart,
// the daily-test board, season history, players around me, the university board, league and achievement moments,
// and the owner analytics page. The server decides everything; the client shows it and sends the player's choices.
import "./game2.css";
import { api } from "./api";
import { h } from "./dom";
import { az, getLang, t } from "./i18n";
import { go } from "./router";
import { screen } from "./screens";
import { leagueBadge } from "./duel5";
import { shareButton, type CardSpec } from "./share";

const G = () => az.game3;
const L = () => getLang();
const loc = (o: { az: string; ru: string }) => (L() === "ru" ? o.ru : o.az);
const LS = {
  get: (k: string) => localStorage.getItem(k),
  set: (k: string, v: string) => localStorage.setItem(k, v),
};

// ---- streak -----------------------------------------------------------------------------------------------------

export async function streakBlock(): Promise<HTMLElement> {
  const box = h("section", { class: "g2-block" });
  const draw = (s: any) => {
    box.replaceChildren(
      h("h2", null, G().streak.title),
      h("p", { class: "soft" }, G().streak.lead),
      h("p", { class: "g2-balance" }, t("game3.streak.days", { n: s.streak })),
      ...s.milestones.map((m: any) => {
        const can = m.reached && !m.claimed;
        const btn: HTMLButtonElement = h("button", {
          class: "btn " + (can ? "primary" : ""),
          disabled: can ? null : true,
          onclick: async () => {
            btn.disabled = true;
            try {
              await api("POST", "/streak/claim", { days: m.days });
              draw(await api("GET", "/streak"));
            } catch {
              btn.disabled = false;
            }
          },
        }, m.claimed ? G().streak.claimed : G().streak.claim) as HTMLButtonElement;
        return h("div", { class: "g2-quest" + (m.claimed ? " done" : "") },
          h("div", { class: "g2-quest-head" },
            h("b", null, t("game3.streak.days", { n: m.days })),
            h("span", { class: "muted" }, `+${m.xp} XP · +${m.qizil} Qızıl`)),
          h("div", { class: "g2-quest-foot" }, h("span", { class: "muted" }, m.reached ? "✓" : ""), btn));
      }),
    );
  };
  draw(await api("GET", "/streak").catch(() => ({ streak: 0, milestones: [] })));
  return box;
}

// ---- notifications ----------------------------------------------------------------------------------------------

export async function notificationsBlock(): Promise<HTMLElement> {
  const since = Number(LS.get("bd_notif_since") ?? 0);
  const n = await api("GET", `/notifications?since=${since}`).catch(() => null);
  LS.set("bd_notif_since", String(Date.now()));
  const items: HTMLElement[] = [];
  for (const c of n?.challenges ?? []) {
    items.push(h("div", { class: "d5-row" }, h("span", null, t("game3.notif.challenge", { from: c.from })),
      h("button", { class: "btn primary", onclick: () => go(`/r/${c.code}`) }, G().notif.open)));
  }
  for (const i of n?.teamInvites ?? []) {
    items.push(h("div", { class: "d5-row" }, h("span", null, t("game3.notif.invite", { from: i.from, team: i.team })),
      h("span", null,
        h("button", { class: "btn primary", onclick: async () => { await api("POST", `/teams/invites/${i.id}`, { accept: true }); go("/teams"); } }, G().notif.accept), " ",
        h("button", { class: "btn", onclick: async () => { await api("POST", `/teams/invites/${i.id}`, { accept: false }); go("/profile"); } }, G().notif.decline))));
  }
  for (const r of n?.reactions ?? []) {
    items.push(h("div", { class: "d5-row" }, h("span", null, t("game3.notif.reaction", { from: r.from, r: (G().reactions as Record<string, string>)[r.reaction] ?? r.reaction }))));
  }
  for (const d of n?.duelResults ?? []) {
    items.push(h("div", { class: "d5-row" }, h("span", null, t("game3.notif.result", { who: d.who })),
      h("button", { class: "btn", onclick: () => go(`/r/${d.code}`) }, G().notif.open)));
  }
  return h("section", { class: "g2-block" },
    h("h2", null, G().notif.title),
    ...(items.length ? items : [h("p", { class: "soft" }, G().notif.none)]));
}

// ---- friends extras ---------------------------------------------------------------------------------------------

export async function friendExtrasBlock(): Promise<HTMLElement> {
  const [friends, teams] = await Promise.all([api("GET", "/friends").catch(() => ({ friends: [] })), api("GET", "/teams").catch(() => ({ teams: [] }))]);
  const inviteable = teams.teams ?? []; // every team I am in can take an invitation
  const box = h("section", { class: "g2-block" }, h("h2", null, G().friendX.title));
  for (const f of friends.friends ?? []) {
    const historyBox = h("div", { hidden: true });
    const historyBtn = h("button", { class: "btn", onclick: async () => {
      if (!historyBox.hidden) { historyBox.hidden = true; return; }
      const r = await api("GET", `/friends/${f.id}/history`).catch(() => ({ matches: [] }));
      historyBox.replaceChildren(
        h("p", { class: "soft" }, G().friendX.historyTitle),
        ...(r.matches.length ? r.matches.map((m: any) => h("div", { class: "d5-row" },
          h("span", null, `${m.points[0]} : ${m.points[1]}`),
          h("span", { class: "d5-pill " + (m.draw ? "" : m.won ? "won" : "lost") }, m.draw ? G().friendX.draw : m.won ? G().friendX.won : G().friendX.lost)))
          : [h("p", { class: "soft" }, G().friendX.noHistory)]));
      historyBox.hidden = false;
    } }, G().friendX.history);
    const reactions = h("div", { class: "g2-form" }, ...(["gg", "nice", "rematch", "ready"] as const).map((r) =>
      h("button", { class: "btn", onclick: async () => {
        await api("POST", "/friends/react", { friendId: f.id, reaction: r }).catch(() => {});
      } }, (G().reactions as Record<string, string>)[r])));
    const teamSel = h("select", { class: "field", "aria-label": G().friendX.pickTeam }, ...(inviteable.length
      ? inviteable.map((x: any) => h("option", { value: x.id }, x.name))
      : [h("option", { value: "" }, G().friendX.noTeams)])) as HTMLSelectElement;
    const inviteMsg = h("span", { class: "muted", role: "status" });
    const invite = h("button", { class: "btn", disabled: inviteable.length ? null : true, onclick: async () => {
      inviteMsg.textContent = "";
      try {
        await api("POST", "/teams/invite", { friendId: f.id, teamId: teamSel.value });
        inviteMsg.textContent = G().friendX.invited;
      } catch (e: any) {
        inviteMsg.textContent = e.code === "already" ? G().friendX.alreadyMember : e.code;
      }
    } }, G().friendX.invite);
    box.append(h("div", { class: "g2-friend" },
      h("b", null, f.nick),
      h("div", { class: "g2-form" }, historyBtn, invite, teamSel),
      inviteMsg,
      historyBox,
      reactions));
  }
  return box;
}

// ---- skills -----------------------------------------------------------------------------------------------------

export async function skillsBlock(): Promise<HTMLElement> {
  const s = await api("GET", "/skills").catch(() => null);
  const rows = (s?.skills ?? []).map((x: any) => h("div", { class: "g2-skill" },
    h("span", null, (G().skillNames as Record<string, string>)[x.id] ?? x.id),
    x.enough
      ? h("div", { class: "g2-bar", style: `--v:${(Math.min(100, x.score) / 100).toFixed(3)}` }, h("i"))
      : h("span", { class: "muted" }, t("game3.skills.notEnough", { n: x.played, total: 3 })),
    x.enough ? h("b", null, t("game3.skills.score", { n: x.score })) : null));
  return h("section", { class: "g2-block" },
    h("h2", null, G().skills.title),
    h("p", { class: "soft" }, G().skills.note),
    ...rows);
}

// ---- daily board -----------------------------------------------------------------------------------------------

export async function dailyBoardPage(scopeIn: string) {
  const scope = ["world", "friends", "city"].includes(scopeIn) ? scopeIn : "world";
  const list = h("div", { class: "g2-board" });
  const tabs = h("div", { class: "g2-tabs" }, ...(["world", "friends", "city"] as const).map((s) =>
    h("a", { href: `/daily-board?scope=${s}`, "data-link": "", class: s === scope ? "on" : "" }, G().daily.scope[s])));
  screen("rank", h("h1", null, G().daily.title), tabs, list);
  const b = await api("GET", `/leaderboards/daily?scope=${scope}`).catch(() => null);
  if (!b) { list.replaceChildren(h("p", { class: "soft" }, G().daily.none)); return; }
  const me = b.me;
  const card = (): CardSpec => ({
    kicker: "Beyin duellisi · " + G().daily.title,
    title: me?.rank ? t("game3.daily.rank", { n: me.rank }) : G().daily.title,
    big: me ? String(me.value) : "—",
    lines: [b.slug, t("game3.daily.players", { n: b.players })],
  });
  list.replaceChildren(
    me ? h("section", { class: "g2-block" }, h("p", { class: "g2-balance" }, `${G().daily.me}: ${me.value} · ${t("game3.daily.rank", { n: me.rank })}`),
      shareButton(card, { button: G().daily.share, saved: G().share.saved })) : h("p", { class: "soft" }, G().daily.none),
    ...b.rows.map((r: any) => h("div", { class: "g2-row" + (r.id ? " me" : "") },
      h("span", { class: "g2-rank" }, String(r.rank)),
      h("span", { class: "g2-nick" }, r.nick),
      h("span", { class: "g2-val" }, String(r.value)))),
    h("p", { class: "soft" }, t("game3.daily.players", { n: b.players })));
}

// ---- around me --------------------------------------------------------------------------------------------------

export async function aroundBlock(kind: string): Promise<HTMLElement | null> {
  const a = await api("GET", `/leaderboards/${kind}/around`).catch(() => null);
  if (!a?.me) return null;
  const row = (nick: string, value: number, rank?: number, me = false) => h("div", { class: "g2-row" + (me ? " me" : "") },
    h("span", { class: "g2-rank" }, rank ? String(rank) : ""), h("span", { class: "g2-nick" }, nick), h("span", { class: "g2-val" }, String(value)));
  const base = a.me.rank;
  return h("section", { class: "g2-block" },
    h("h3", { class: "g2-sub" }, G().board.around),
    ...a.above.map((r: any, i: number) => row(r.nick, r.value, base - (a.above.length - i))),
    row(a.me.nick || az.game2.board.me, a.me.value, base, true),
    ...a.below.map((r: any, i: number) => row(r.nick, r.value, base + i + 1)));
}

// ---- universities -----------------------------------------------------------------------------------------------

export async function universityBlock(): Promise<HTMLElement> {
  const r = await api("GET", "/leaderboards/universities").catch(() => ({ rows: [] }));
  return h("section", { class: "g2-block" },
    h("h2", null, G().university.title),
    ...(r.rows.length
      ? r.rows.map((x: any) => h("div", { class: "g2-row" }, h("span", { class: "g2-rank" }, String(x.rank)), h("span", { class: "g2-nick" }, x.name), h("span", { class: "g2-val" }, String(x.avgRating))))
      : [h("p", { class: "soft" }, G().university.none)]));
}

// ---- season history ---------------------------------------------------------------------------------------------

export async function seasonBlock(): Promise<HTMLElement> {
  const s = await api("GET", "/season").catch(() => null);
  const rows = (s?.history ?? []).map((x: any) => h("div", { class: "d5-row" },
    h("span", null, t("game3.season.row", { id: x.season_id, peak: x.peak, played: x.played, wins: x.wins }))));
  return h("section", { class: "g2-block" },
    h("h2", null, G().season.title),
    ...(rows.length ? rows : [h("p", { class: "soft" }, G().season.none)]));
}

// ---- league and achievement moments -----------------------------------------------------------------------------

const LEAGUE_ORDER = ["burunc", "gumus", "qizil", "platin", "almaz", "ustad", "efsane"];

/** Shows a congratulation once when the player moves to a higher league. Returns the element to put on the home screen. */
export async function leagueMoment(): Promise<HTMLElement | null> {
  const r = await api("GET", "/ratings/me").catch(() => null);
  if (!r) return null;
  const now = LEAGUE_ORDER.indexOf(r.league);
  const before = LS.get("bd_league");
  LS.set("bd_league", r.league);
  if (before === null) return null;
  const prev = LEAGUE_ORDER.indexOf(before);
  if (now <= prev) return null;
  const name = (az.duel5.leagues as Record<string, string>)[r.league];
  return h("div", { class: "g2-up", role: "status" }, leagueBadge(r.league, 56),
    h("div", null, h("b", null, t("game3.league.up", { name })), h("p", { class: "soft" }, G().league.congrats)));
}

/** Shows a toast for achievements unlocked since the last visit (the first visit only stores the current state). */
export async function achievementToasts(): Promise<HTMLElement | null> {
  const a = await api("GET", "/achievements").catch(() => null);
  if (!a) return null;
  const unlocked: string[] = a.achievements.filter((x: any) => x.unlocked).map((x: any) => x.id);
  const seenRaw = LS.get("bd_ach_seen");
  LS.set("bd_ach_seen", JSON.stringify(unlocked));
  if (seenRaw === null) return null;
  const seen = new Set<string>(JSON.parse(seenRaw));
  const fresh = a.achievements.filter((x: any) => x.unlocked && !seen.has(x.id));
  if (!fresh.length) return null;
  return h("div", { class: "g2-toast", role: "status" }, ...fresh.map((x: any) =>
    h("span", null, t("game2.achievement.unlocked", { name: loc(x.title) }))));
}

// ---- owner analytics --------------------------------------------------------------------------------------------

export function adminPage() {
  const token = h("input", { class: "field", type: "password", placeholder: G().admin.token, "aria-label": G().admin.token }) as HTMLInputElement;
  const out = h("div", null);
  const msg = h("p", { class: "soft", role: "status" }, G().admin.note);
  screen(null, h("h1", null, G().admin.title),
    h("div", { class: "g2-form" }, token, h("button", { class: "btn primary", onclick: async () => {
      msg.textContent = "";
      const res = await fetch("/api/admin/duel-stats", { headers: { "x-admin-token": token.value } });
      if (!res.ok) { msg.textContent = G().admin.wrong; out.replaceChildren(); return; }
      const d = await res.json();
      out.replaceChildren(...Object.entries(d).map(([k, v]) => h("section", { class: "g2-block" },
        h("h3", { class: "g2-sub" }, k),
        h("pre", { class: "g2-pre" }, JSON.stringify(v, null, 2)))));
    } }, G().admin.load)),
    msg, out);
}

/** The home-screen blocks that belong to this module: streak, notifications, and the moments of progress. */
export async function homeBlocks(): Promise<HTMLElement> {
  const [streak, notes, league, toasts, daily] = await Promise.all([streakBlock(), notificationsBlock(), leagueMoment(), achievementToasts(), api("POST", "/daily/reward").catch(() => null)]);
  const dailyMsg = daily?.granted ? h("div", { class: "g2-toast", role: "status" }, t("game3.daily.reward", { xp: daily.xp, qizil: daily.qizil })) : null;
  return h("div", null, league, toasts, dailyMsg, streak, notes);
}

