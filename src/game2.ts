// Quests, shop, Marafon, leaderboards (with the city battle), friends, teams and the profile.
// Every result and reward is decided on the server; the client only shows it and sends what the player does.
import "./game2.css";
import { api, me } from "./api";
import { h } from "./dom";
import { az, getLang, t } from "./i18n";
import { go, onLeave } from "./router";
import { screen } from "./screens";
import { avatar, leagueBadge } from "./duel5";

const G = () => az.game2;
const loc = (o: { az: string; ru: string }) => (getLang() === "ru" ? o.ru : o.az);
const err = (e: any) => (e && e.code) || "error";

// ---- quests and season block on the home screen -----------------------------------------------------------------

function questRow(q: any, onDone: () => void): HTMLElement {
  const done = q.progress >= q.target;
  const pct = Math.min(1, q.progress / q.target);
  const reward = t("game2.quests.reward", { xp: q.xp, qizil: q.qizil > 0 ? t("game2.quests.qizilPart", { n: q.qizil }) : "" });
  const btn: HTMLButtonElement = h("button", {
    class: "btn " + (done && !q.claimed ? "primary" : ""),
    disabled: done && !q.claimed ? null : true,
    onclick: async () => {
      btn.disabled = true;
      try {
        await api("POST", `/quests/${q.id}/claim`);
        onDone();
      } catch {
        btn.disabled = false;
      }
    },
  }, q.claimed ? az.game2.quests.claimed : done ? az.game2.quests.claim : az.game2.quests.notReady) as HTMLButtonElement;
  return h("div", { class: "g2-quest" + (q.claimed ? " done" : "") },
    h("div", { class: "g2-quest-head" }, h("b", null, loc(q.title)), h("span", { class: "muted" }, reward)),
    h("div", { class: "g2-bar", style: `--v:${pct.toFixed(3)}` }, h("i")),
    h("div", { class: "g2-quest-foot" },
      h("span", { class: "muted" }, t("game2.quests.progress", { n: Math.min(q.progress, q.target), total: q.target })),
      btn));
}

/** Daily and weekly quests with the claim buttons. Redraws itself after a claim. */
export function questsBlock(quests: any[]): HTMLElement {
  const box = h("section", { class: "g2-block" });
  const draw = (list: any[]) => {
    const daily = list.filter((q) => q.kind === "daily");
    const weekly = list.filter((q) => q.kind === "weekly");
    const again = () => void api("GET", "/quests").then((r) => draw(r.quests)).catch(() => {});
    box.replaceChildren(
      h("h2", null, az.game2.quests.title),
      h("h3", { class: "g2-sub" }, az.game2.quests.daily),
      ...(daily.length ? daily.map((q) => questRow(q, again)) : [h("p", { class: "soft" }, az.game2.quests.empty)]),
      h("h3", { class: "g2-sub" }, az.game2.quests.weekly),
      ...(weekly.length ? weekly.map((q) => questRow(q, again)) : [h("p", { class: "soft" }, az.game2.quests.empty)]));
  };
  draw(quests);
  return box;
}

/** Season and event line for the home screen. */
export async function homeExtras(): Promise<HTMLElement> {
  const [season, quests] = await Promise.all([api("GET", "/season").catch(() => null), api("GET", "/quests").catch(() => null)]);
  const seasonLine = season?.season
    ? h("p", { class: "soft" }, t("game2.season.line", { id: season.season.id, days: season.season.daysLeft }))
    : h("p", { class: "soft" }, az.game2.season.none);
  const events = (season?.events ?? []).map((e: any) => h("p", { class: "g2-event" }, t("game2.season.event", { name: loc(e.title) }), " · ", loc(e.description)));
  return h("div", null, h("div", { class: "g2-season" }, seasonLine, ...events), questsBlock(quests?.quests ?? []));
}

// ---- shop -------------------------------------------------------------------------------------------------------

export async function shopPage() {
  const body = h("div", { class: "g2-shop" });
  const status = h("p", { class: "soft", role: "status" });
  const draw = (d: any) => {
    const bySlot = (slot: string) => d.items.filter((i: any) => i.slot === slot);
    const card = (i: any) => {
      const actions: HTMLElement[] = [];
      if (i.owned) {
        actions.push(i.equipped
          ? h("button", { class: "btn", onclick: async () => { await api("POST", "/shop/unequip", { slot: i.slot }); reload(); } }, az.game2.shop.unequip)
          : h("button", { class: "btn primary", onclick: async () => { await api("POST", "/shop/equip", { item: i.id }); reload(); } }, az.game2.shop.equip));
      } else {
        const can = d.balance >= i.price;
        actions.push(h("button", { class: "btn " + (can ? "primary" : ""), disabled: can ? null : true, onclick: async () => {
          try {
            await api("POST", "/shop/buy", { item: i.id });
            status.textContent = az.game2.shop.bought;
            reload();
          } catch (e: any) {
            status.textContent = e.code === "insufficient" ? az.game2.shop.notEnough : err(e);
          }
        } }, t("game2.shop.buy", { n: i.price })));
      }
      return h("div", { class: "g2-item" + (i.equipped ? " on" : "") },
        h("span", { class: "g2-look " + i.look, "aria-hidden": "true" }),
        h("div", { class: "g2-item-meta" },
          h("b", null, loc(i.name)),
          h("span", { class: "muted" }, loc(i.description)),
          i.owned ? h("span", { class: "g2-tag" }, i.equipped ? az.game2.shop.equipped : az.game2.shop.owned) : h("span", { hidden: true })),
        ...actions);
    };
    body.replaceChildren(
      h("p", { class: "g2-balance" }, t("game2.shop.balance", { n: d.balance })),
      h("p", { class: "soft" }, az.game2.shop.realMoneyOff),
      status,
      ...d.slots.map((slot: string) => h("section", { class: "g2-block" },
        h("h3", { class: "g2-sub" }, (az.game2.shop.slot as Record<string, string>)[slot]),
        ...(bySlot(slot).length ? bySlot(slot).map(card) : [h("p", { class: "soft" }, az.game2.shop.empty)]))));
  };
  const reload = () => void api("GET", "/shop").then(draw).catch(() => {});
  screen("shop", h("h1", null, az.game2.shop.title), body);
  draw(await api("GET", "/shop"));
}

// ---- Marafon ----------------------------------------------------------------------------------------------------

export async function marafonPage() {
  const body = h("div", { class: "g2-marafon" });
  const top = h("p", { class: "soft", role: "status" }, az.game2.marafon.sub);
  screen("duels", h("h1", null, az.game2.marafon.title), top, body);
  let timers: ReturnType<typeof setTimeout>[] = [];
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  onLeave(clear);

  const hearts = (n: number) => "♥".repeat(Math.max(0, n)) + "♡".repeat(Math.max(0, 3 - n));
  const head = (v: any) => h("div", { class: "g2-marafon-head" },
    h("span", { class: "g2-hearts", "aria-label": `${az.game2.marafon.lives}: ${v.lives}` }, hearts(v.lives)),
    h("span", null, t("game2.marafon.level", { n: v.level })),
    h("span", null, `${az.game2.marafon.score}: ${v.score}`));

  function showOver(v: any, best: number) {
    clear();
    body.replaceChildren(
      h("h2", null, az.game2.marafon.over),
      h("p", { class: "g2-big" }, `${v.score}`),
      h("p", { class: "soft" }, `${az.game2.marafon.best}: ${best}`),
      h("button", { class: "btn primary block", onclick: () => void start() }, az.game2.marafon.again),
      h("button", { class: "btn block", onclick: () => go("/duels") }, az.duel5.home));
  }

  function showTask(v: any) {
    clear();
    const task = v.task;
    const area = h("div", { class: "g2-task" });
    const feedback = h("p", { class: "g2-feedback", role: "status" });
    const bar = h("div", { class: "g2-bar" }, h("i", { style: `animation:g2-drain ${task.limitMs}ms linear forwards` }));
    const answer = async (choice: number) => {
      clear();
      area.querySelectorAll("button").forEach((b) => { b.disabled = true; });
      try {
        const r = await api("POST", "/marafon/answer", { runId: v.runId, idx: task.idx, choice });
        const why = r.why === "ok" ? az.game2.marafon.right : r.why === "late" ? az.game2.marafon.late : r.why === "early" ? az.game2.marafon.early : az.game2.marafon.wrong;
        feedback.textContent = r.right ? az.game2.marafon.right : why;
        feedback.className = "g2-feedback " + (r.right ? "good" : "bad");
        if (r.over) { showOver({ score: r.score }, r.best); return; }
        timers.push(setTimeout(() => showTask(r), 700));
      } catch (e: any) {
        feedback.textContent = err(e);
      }
    };
    const choices = (opts: string[]) => h("div", { class: "opts" }, ...opts.map((o, i) =>
      h("button", { class: "btn opt-wide", onclick: () => void answer(i) }, o)));

    if (task.kind === "reaction") {
      const go_ = h("button", { class: "g2-tap", disabled: true, onclick: () => void answer(0) }, az.game2.marafon.wait) as HTMLButtonElement;
      area.append(h("p", { class: "soft" }, az.game2.marafon.prompt.reaction), go_);
      timers.push(setTimeout(() => {
        go_.disabled = false;
        go_.textContent = az.game2.marafon.tapNow;
        go_.classList.add("ready");
      }, task.delayMs ?? 0));
    } else if (task.kind === "memory" && Array.isArray(task.seq)) {
      const shown = h("p", { class: "g2-seq" }, task.seq.join("  "));
      area.append(h("p", { class: "soft" }, az.game2.marafon.memoryShow), shown);
      timers.push(setTimeout(() => {
        shown.textContent = az.game2.marafon.memoryRepeat;
        shown.classList.add("hide");
        area.append(choices(task.options.map((o: string) => o.split("-").join("  "))));
      }, task.seqMs ?? 1500));
    } else if (task.kind === "arithmetic") {
      area.append(h("p", { class: "g2-prompt" }, task.text), choices(task.options));
    } else if (task.kind === "sequence") {
      area.append(h("p", { class: "soft" }, az.game2.marafon.prompt.sequence), h("p", { class: "g2-seq" }, task.text), choices(task.options));
    } else {
      const prompt = task.kind === "riddle" ? task.text : (az.game2.marafon.prompt as Record<string, string>)[task.kind];
      area.append(h("p", { class: "g2-prompt" }, prompt), choices(task.options));
    }
    body.replaceChildren(head(v), bar, area, feedback,
      h("button", { class: "btn block", onclick: async () => {
        clear();
        try {
          const r = await api("POST", "/marafon/stop", { runId: v.runId });
          showOver({ score: r.score }, r.best);
        } catch { go("/duels"); }
      } }, az.game2.marafon.stop));
  }

  async function start() {
    clear();
    try {
      const v = await api("POST", "/marafon/start");
      if (v.task) showTask(v);
      else showOver(v, 0);
    } catch (e: any) {
      top.textContent = err(e);
    }
  }
  await start();
}

// ---- leaderboards and city battle -------------------------------------------------------------------------------

const TABS = ["rating", "beyin", "marafon", "teams", "cities"] as const;
type BoardTab = (typeof TABS)[number];

export async function boardPage(tabIn: string, scopeIn: string, pageIn = 1) {
  const tab = (TABS as readonly string[]).includes(tabIn) ? (tabIn as BoardTab) : "rating";
  const scope = ["world", "week", "friends"].includes(scopeIn) ? scopeIn : "world";
  const list = h("div", { class: "g2-board" });
  const tabsEl = h("div", { class: "g2-tabs", role: "tablist" }, ...TABS.map((k) =>
    h("a", { href: `/leaderboard?tab=${k}`, "data-link": "", class: k === tab ? "on" : "", role: "tab" },
      (az.game2.board.tabs as Record<string, string>)[k])));
  const scopes = tab === "cities" || tab === "teams" ? [] : tab === "marafon" ? ["world", "week", "friends"] : ["world", "friends"];
  const scopeEl = h("div", { class: "g2-tabs" }, ...scopes.map((s) =>
    h("a", { href: `/leaderboard?tab=${tab}&scope=${s}`, "data-link": "", class: s === scope ? "on" : "" },
      (az.game2.board.scope as Record<string, string>)[s])));
  screen("rank", h("h1", null, az.game2.board.title), tabsEl, scopeEl, list);

  if (tab === "cities") {
    const b = await api("GET", "/cities/battle");
    const names = b.cities.map((c: any) => c.name);
    list.replaceChildren(
      h("section", { class: "g2-block" },
        h("h2", null, az.game2.board.cityTitle),
        h("p", { class: "soft" }, t("game2.board.cityWeek", { n: Math.max(0, Math.ceil((b.endsAt - Date.now()) / 86400000)) })),
        ...b.cities.map((c: any) => h("div", { class: "g2-city" },
          h("b", null, c.name),
          c.enough ? h("span", null, t("game2.board.cityScore", { n: c.score })) : h("span", { class: "muted" }, az.game2.board.cityNotEnough),
          h("span", { class: "muted" }, t("game2.board.cityPlayers", { n: c.players })))),
        h("p", { class: "g2-leader" }, b.leader === null ? "" : b.leader === "draw" ? az.game2.board.cityDraw
          : t("game2.board.cityLeader", { name: names[b.cities.findIndex((c: any) => c.city === b.leader)] ?? b.leader })),
        h("p", { class: "soft" }, az.game2.board.cityNote),
        h("p", { class: "soft" }, t("game2.board.cityMin", { m: b.minMatches, n: b.minPlayers })),
        h("p", { class: "soft" }, az.game2.board.cityChangeNote)));
    return;
  }
  if (tab === "teams") {
    const r = await api("GET", "/leaderboards/teams");
    list.replaceChildren(...(r.rows.length ? r.rows.map((x: any) => boardRow(x.rank, x.name, t("game2.teams.avg", { n: x.avgRating }) + (x.verified ? "" : ` · ${az.game2.teams.unverified}`), null, false)) : [h("p", { class: "soft" }, az.game2.board.empty)]));
    return;
  }
  const r = await api("GET", `/leaderboards/${tab}?scope=${scope}&page=${pageIn}`).catch(() => null);
  if (!r) { list.replaceChildren(h("p", { class: "soft" }, az.game2.board.empty)); return; }
  const rows = r.rows.map((x: any) => boardRow(x.rank, x.nick, String(x.value), x.id, x.id === "me"));
  const pager = h("div", { class: "g2-pager" },
    h("button", { class: "btn", disabled: pageIn <= 1 ? true : null, onclick: () => go(`/leaderboard?tab=${tab}&scope=${scope}&page=${pageIn - 1}`) }, "‹"),
    h("span", { class: "muted" }, `${pageIn}/${r.pages}`),
    h("button", { class: "btn", disabled: pageIn >= r.pages ? true : null, onclick: () => go(`/leaderboard?tab=${tab}&scope=${scope}&page=${pageIn + 1}`) }, "›"));
  const mine = r.me ? h("p", { class: "g2-me" }, `${az.game2.board.rank}: ${r.me.rank} · ${r.me.value}`) : null;
  list.replaceChildren(...(rows.length ? rows : [h("p", { class: "soft" }, az.game2.board.empty)]), ...(mine ? [mine] : []), pager);
}

function boardRow(rank: number, nick: string, value: string, _id: unknown, me: boolean) {
  return h("div", { class: "g2-row" + (me ? " me" : "") },
    h("span", { class: "g2-rank" }, String(rank)),
    h("span", { class: "g2-nick" }, nick + (me ? ` · ${az.game2.board.me}` : "")),
    h("span", { class: "g2-val" }, value));
}

// ---- friends ----------------------------------------------------------------------------------------------------

export async function friendsPage() {
  const body = h("div", null);
  screen("duels", h("h1", null, az.game2.friends.title), body);
  const status = h("p", { class: "soft", role: "status" });
  async function draw() {
    const d = await api("GET", "/friends");
    const input = h("input", { class: "field", maxlength: 12, placeholder: az.game2.friends.addByCode, "aria-label": az.game2.friends.addByCode }) as HTMLInputElement;
    body.replaceChildren(
      h("section", { class: "g2-block" },
        h("p", { class: "soft" }, az.game2.friends.myCode),
        h("p", { class: "g2-code" }, d.code)),
      h("section", { class: "g2-block" },
        h("div", { class: "g2-form" }, input,
          h("button", { class: "btn primary", onclick: async () => {
            status.textContent = "";
            try {
              await api("POST", "/friends/add", { code: input.value });
              await draw();
            } catch (e: any) {
              status.textContent = e.code === "self" ? az.game2.friends.selfCode : e.code === "not_found" ? az.game2.friends.notFound : err(e);
            }
          } }, az.game2.friends.add)),
        status),
      d.challenges.length ? h("section", { class: "g2-block" }, h("h3", { class: "g2-sub" }, az.game2.friends.incoming),
        ...d.challenges.map((c: any) => h("div", { class: "g2-row" },
          h("span", { class: "g2-nick" }, c.from),
          h("button", { class: "btn primary", onclick: () => go(`/r/${c.code}`) }, az.game2.friends.join)))) : h("span", { hidden: true }),
      h("section", { class: "g2-block" },
        ...(d.friends.length ? d.friends.map((f: any) => h("div", { class: "g2-friend" },
          h("div", { class: "g2-friend-head" }, avatar(f.nick), h("b", null, f.nick), h("span", { class: "muted" }, f.rating ?? "")),
          h("span", { class: "muted" }, t("game2.friends.h2h", { w: f.wins, l: f.losses, d: f.draws })),
          h("button", { class: "btn", onclick: async () => {
            try {
              const r = await api("POST", "/friends/challenge", { friendId: f.id });
              go(`/r/${r.code}`);
            } catch (e: any) {
              status.textContent = e.code === "not_friend" ? az.game2.friends.notFriend : err(e);
            }
          } }, az.game2.friends.challenge))) : [h("p", { class: "soft" }, az.game2.friends.noFriends)])));
  }
  await draw();
}

// ---- teams ------------------------------------------------------------------------------------------------------

export async function teamsPage() {
  const body = h("div", null);
  screen("rank", h("h1", null, az.game2.teams.title), body);
  const status = h("p", { class: "soft", role: "status" });
  const reasonText = (r: string) => (az.game2.teams as unknown as Record<string, string>)[r === "not_verified" ? "notVerified" : r === "full" ? "full" : r === "not_found" ? "notFound" : r === "limit" ? "limit" : "badName"];
  async function draw() {
    const [mine, ranking] = await Promise.all([api("GET", "/teams"), api("GET", "/leaderboards/teams")]);
    const name = h("input", { class: "field", maxlength: 40, placeholder: az.game2.teams.name, "aria-label": az.game2.teams.name }) as HTMLInputElement;
    const kind = h("select", { class: "field", "aria-label": az.game2.teams.kind }, ...Object.entries(az.game2.teams.kinds).map(([k, v]) =>
      h("option", { value: k }, v))) as HTMLSelectElement;
    const code = h("input", { class: "field", maxlength: 8, placeholder: az.game2.teams.code, "aria-label": az.game2.teams.code }) as HTMLInputElement;
    body.replaceChildren(
      h("section", { class: "g2-block" }, h("h3", { class: "g2-sub" }, az.game2.teams.create),
        h("div", { class: "g2-form" }, name, kind, h("button", { class: "btn primary", onclick: async () => {
          status.textContent = "";
          try {
            const r = await api("POST", "/teams", { name: name.value, kind: kind.value });
            status.textContent = t("game2.teams.yourCode", { code: r.code });
            await draw();
          } catch (e: any) {
            status.textContent = reasonText(e.code);
          }
        } }, az.game2.teams.createBtn))),
      h("section", { class: "g2-block" }, h("h3", { class: "g2-sub" }, az.game2.teams.joinTitle),
        h("div", { class: "g2-form" }, code, h("button", { class: "btn", onclick: async () => {
          status.textContent = "";
          try {
            const r = await api("POST", "/teams/join", { code: code.value });
            go(`/teams/${r.id}`);
          } catch (e: any) {
            status.textContent = reasonText(e.code);
          }
        } }, az.game2.teams.joinBtn))),
      status,
      h("section", { class: "g2-block" }, h("h3", { class: "g2-sub" }, az.game2.teams.mine),
        ...(mine.teams.length ? mine.teams.map((x: any) => h("div", { class: "g2-row" },
          h("button", { class: "g2-link", onclick: () => go(`/teams/${x.id}`) }, x.name),
          h("span", { class: "muted" }, `${x.members} · ${(az.game2.teams.kinds as Record<string, string>)[x.kind] ?? x.kind}`)))
          : [h("p", { class: "soft" }, az.game2.teams.none)])),
      h("section", { class: "g2-block" }, h("h3", { class: "g2-sub" }, az.game2.teams.ranking),
        ...(ranking.rows.length ? ranking.rows.map((x: any) => boardRow(x.rank, x.name, t("game2.teams.avg", { n: x.avgRating }), null, false))
          : [h("p", { class: "soft" }, az.game2.teams.notRanked)])));
  }
  await draw();
}

export async function teamPage(id: string) {
  const team = await api("GET", `/teams/${id}`).catch(() => null);
  if (!team) return go("/teams", true);
  screen("rank",
    h("a", { class: "link", href: "/teams", "data-link": "" }, az.common.back),
    h("h1", null, team.name),
    h("p", { class: "soft" }, `${(az.game2.teams.kinds as Record<string, string>)[team.kind] ?? team.kind} · ${team.verified ? "" : az.game2.teams.unverified}`),
    team.ranked
      ? h("p", null, t("game2.teams.avg", { n: team.avgRating }))
      : h("p", { class: "soft" }, az.game2.teams.notRanked),
    h("h3", { class: "g2-sub" }, az.game2.teams.members),
    ...team.members.map((m: any) => boardRow(0, m.nick, String(m.rating), m.id, m.id === me()?.id)));
}

// ---- profile ----------------------------------------------------------------------------------------------------

export async function profilePage() {
  const [p, ach, shop, hist, rr] = await Promise.all([
    api("GET", "/profile/me"),
    api("GET", "/achievements"),
    api("GET", "/shop"),
    api("GET", "/matches/mine").catch(() => ({ matches: [] })),
    api("GET", "/ratings/me").catch(() => null),
  ]);
  const eq = (slot: string) => shop.items.find((i: any) => i.id === p.equipped[slot]);
  const avatarItem = eq("avatar");
  const frame = eq("frame");
  const title = eq("title");
  const nick = me()?.nickname ?? "";
  const xpPct = p.xp.need ? p.xp.into / p.xp.need : 0;
  const winRate = p.stats.matches ? Math.round((p.stats.wins / p.stats.matches) * 1000) / 10 : 0;
  const achGrid = h("div", { class: "g2-ach" }, ...ach.achievements.map((a: any) => h("div", {
    class: `g2-ach-item r-${a.rarity}` + (a.unlocked ? "" : " locked"),
    title: loc(a.title),
  },
    h("b", null, loc(a.title)),
    h("span", { class: "muted" }, a.unlocked ? (az.game2.profile.rarity as Record<string, string>)[a.rarity] : `${a.value}/${a.target}`))));
  screen("pass",
    h("div", { class: "g2-profile-head" },
      h("span", { class: "g2-frame " + (frame ? frame.look : "") }, avatarItem
        ? h("span", { class: "g2-look " + avatarItem.look })
        : avatar(nick)),
      h("div", null,
        h("h1", { class: "g2-name" }, nick),
        title ? h("span", { class: "g2-tag" }, loc(title.name)) : h("span", { hidden: true }),
        h("span", { class: "muted" }, t("game2.profile.level", { n: p.level }))),
      h("span", { class: "d5-gold" }, `${p.qizil} ${az.game2.profile.gold}`)),
    h("div", { class: "g2-bar", style: `--v:${xpPct.toFixed(3)}` }, h("i")),
    h("p", { class: "soft" }, t("game2.profile.xp", { into: p.xp.into, need: p.xp.need })),
    h("section", { class: "g2-block g2-rating" },
      leagueBadge(p.rating.league, 56),
      h("div", null,
        h("span", { class: "eyebrow" }, az.game2.profile.league),
        h("b", null, (az.duel5.leagues as Record<string, string>)[p.rating.league]),
        h("p", { class: "muted" }, `${az.game2.profile.rating}: ${p.rating.value} · ${az.game2.profile.peak}: ${p.rating.peak}`))),
    h("section", { class: "g2-stats" },
      stat(az.game2.profile.matches, p.stats.matches),
      stat(az.game2.profile.matchesWon, p.stats.wins),
      stat(az.game2.profile.winRate, `${winRate}%`),
      stat(az.game2.profile.bestStreak, rr?.bestStreak ?? 0),
      stat(az.game2.marafon.best, p.stats.marafon_best)),
    h("h2", null, t("game2.profile.achievements", { n: p.achievements.unlocked, total: p.achievements.total })),
    achGrid,
    h("h2", null, az.game2.profile.equipped),
    p.equipped && Object.keys(p.equipped).length
      ? h("p", null, ...Object.keys(p.equipped).map((slot) => h("span", { class: "g2-tag" }, shop.items.find((i: any) => i.id === p.equipped[slot])?.name ? loc(shop.items.find((i: any) => i.id === p.equipped[slot]).name) : "")))
      : h("p", { class: "soft" }, az.game2.profile.nothingEquipped),
    h("h2", null, az.game2.profile.recent),
    ...(hist.matches.length ? hist.matches.slice(0, 5).map((m: any) => h("div", { class: "d5-row" },
      h("span", null, `${m.points[0]} : ${m.points[1]} · ${m.opponentBot ? az.game2.profile.bot : ""}`),
      h("span", { class: "d5-pill " + (m.draw ? "" : m.won ? "won" : "lost") }, m.draw ? az.game2.profile.draw : m.won ? az.game2.profile.won : az.game2.profile.lost)))
      : [h("p", { class: "soft" }, az.game2.profile.noRecent)]),
    h("div", { class: "g2-links" },
      h("a", { class: "btn", href: "/shop", "data-link": "" }, az.game2.shop.title),
      h("a", { class: "btn", href: "/friends", "data-link": "" }, az.game2.friends.title),
      h("a", { class: "btn", href: "/teams", "data-link": "" }, az.game2.teams.title),
      h("a", { class: "btn", href: "/passport", "data-link": "" }, az.game2.profile.settings)));
}

function stat(label: string, value: string | number) {
  return h("div", { class: "g2-stat" }, h("b", null, String(value)), h("span", { class: "muted" }, label));
}
