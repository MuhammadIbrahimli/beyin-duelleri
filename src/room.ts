// "İlk cavab": a live 1v1 round race over a WebSocket to the room's Durable Object.
// The server decides every result; this file only shows what it sends and sends taps back.
import "./room.css";
import { api, session } from "./api";
import { h, mount } from "./dom";
import { az, t } from "./i18n";
import { go, onLeave } from "./router";

const app = () => document.getElementById("app")!;
const CODE = /^[A-Z0-9]{4,8}$/;
type Slot = 0 | 1;
interface Round { n: number; options: number[]; buttons: HTMLButtonElement[]; decided: boolean; locked: boolean }

const errText = (code?: string) => (az.live.err as Record<string, string>)[code ?? ""] ?? az.common.error;

/** Entry screen: create a room, or open one by its code. */
export function livePage() {
  const err = h("p", { class: "soft", role: "alert" });
  const codeIn = h("input", { class: "field", placeholder: az.live.codePh, maxlength: 8, autocapitalize: "characters", "aria-label": az.live.codePh }) as HTMLInputElement;
  const create = h("button", {
    class: "btn primary block",
    onclick: async () => {
      err.textContent = "";
      try {
        const r = await api<{ code: string }>("POST", "/rooms");
        go(`/r/${r.code}`);
      } catch (e: any) {
        err.textContent = errText(e.code);
      }
    },
  }, az.live.create);
  const join = h("button", {
    class: "btn block",
    onclick: () => {
      const c = codeIn.value.trim().toUpperCase();
      if (!CODE.test(c)) { err.textContent = az.live.err.bad_code; return; }
      go(`/r/${c}`);
    },
  }, az.live.join);
  mount(app(), h("div", { class: "screen room-entry" },
    h("a", { class: "link", href: "/duels", "data-link": "" }, "←"),
    h("h1", { class: "room-title" }, az.live.title),
    h("p", { class: "soft" }, az.live.sub),
    create,
    h("p", { class: "soft room-or" }, az.live.or),
    h("div", { class: "room-join" }, codeIn, join),
    err,
  ));
}

/** The room itself: lobby, countdown, rounds and the result. */
export function roomPage(codeRaw: string) {
  const code = codeRaw.toUpperCase();
  const status = h("p", { class: "soft", role: "status", "aria-live": "polite" });
  const scoreEl = h("div", { class: "room-score" });
  const bar = h("div", { class: "room-bar" });
  const track = h("div", { class: "room-track" }, bar);
  const qEl = h("div", { class: "room-q" });
  const opts = h("div", { class: "opts" });
  const share = h("div", { class: "room-share" });
  const again = h("button", { class: "btn primary block", hidden: true, onclick: () => go("/live") }, az.live.again);
  const retry = h("button", { class: "btn block", hidden: true, onclick: () => { retry.hidden = true; void connect(); } }, az.live.reconnect);
  mount(app(), h("div", { class: "screen room" }, scoreEl, status, track, qEl, opts, share, again, retry));

  if (!CODE.test(code)) { status.textContent = az.live.err.bad_code; return; }

  let ws: WebSocket | null = null;
  let slot: Slot | null = null;
  let nicks: [string, string] = ["", ""];
  let score: [number, number] = [0, 0];
  let round: Round | null = null;
  let finished = false;
  let leaving = false;
  onLeave(() => { leaving = true; ws?.close(); });

  const opp = (): Slot => (slot === 0 ? 1 : 0);
  const oppName = () => nicks[opp()] || az.live.opp;

  function drawScore() {
    if (slot === null) { scoreEl.replaceChildren(); return; }
    scoreEl.replaceChildren(
      h("span", null, az.live.you),
      h("strong", null, `${score[slot]} : ${score[opp()]}`),
      h("span", null, oppName()),
    );
  }

  function showShare() {
    const url = `${location.origin}/r/${code}`;
    const copy = h("button", { class: "btn block", onclick: () => {
      void navigator.clipboard?.writeText(url).then(() => { copy.textContent = az.live.copied; }).catch(() => {});
    } }, az.live.copy);
    const canShare = typeof navigator.share === "function";
    const sharing = canShare ? h("button", { class: "btn primary block", onclick: () => {
      void navigator.share({ title: az.app.name, text: t("live.shareText", { code }), url }).catch(() => {});
    } }, az.live.share) : null;
    share.replaceChildren(h("p", { class: "room-code" }, code), copy, ...(sharing ? [sharing] : []));
  }

  function tap(i: number) {
    if (!round || !ws || ws.readyState !== WebSocket.OPEN || round.decided || round.locked) return;
    ws.send(JSON.stringify({ t: "tap", round: round.n, choice: i }));
  }

  function startRound(m: any) {
    round = { n: m.n, options: m.options, buttons: [], decided: false, locked: false };
    round.buttons = (m.options as number[]).map((v, i) => h("button", { class: "btn opt-wide", onclick: () => tap(i) }, String(v)) as HTMLButtonElement);
    opts.replaceChildren(...round.buttons);
    qEl.textContent = m.text;
    share.replaceChildren();
    setStatus(t("live.round", { n: m.n, total: m.total }) + " · " + az.live.pick);
    // the bar drains over the time the server gave; a reconnect passes the time left
    bar.style.animation = "none";
    void bar.offsetWidth;
    bar.style.animation = `room-drain ${Math.max(0, m.ms)}ms linear forwards`;
  }

  function settle(answer?: number) {
    if (!round) return;
    round.decided = true;
    round.buttons.forEach((b) => { b.disabled = true; });
    if (answer !== undefined) round.buttons[round.options.indexOf(answer)]?.classList.add("good");
    bar.style.animationPlayState = "paused";
  }

  function setStatus(s: string) { status.textContent = s; }

  function endView(m: any) {
    finished = true;
    settle();
    score = m.score;
    drawScore();
    track.hidden = true;
    qEl.textContent = "";
    opts.replaceChildren();
    share.replaceChildren();
    const title = m.winner === -1 ? az.live.draw : m.winner === slot ? az.live.winYou : t("live.winOpp", { nick: oppName() });
    const sub = m.reason === "forfeit" ? (m.winner === slot ? az.live.forfeitWin : az.live.forfeitLose) : "";
    setStatus([az.live.endTitle, title, sub].filter(Boolean).join(". "));
    again.hidden = false;
  }

  function handle(m: any) {
    switch (m.t) {
      case "welcome": {
        slot = m.slot as Slot;
        nicks = m.state.nicks;
        score = m.state.score;
        drawScore();
        if (m.state.phase === "lobby") { setStatus(az.live.waitSub); showShare(); }
        return;
      }
      case "opponent": {
        if (slot === null) return;
        if (m.state === "joined") { nicks[opp()] = m.nick; drawScore(); setStatus(t("live.joined", { nick: m.nick })); }
        if (m.state === "back") setStatus(t("live.back", { nick: oppName() }));
        if (m.state === "away") setStatus(t("live.away", { nick: oppName(), s: Math.round(m.ms / 1000) }));
        return;
      }
      case "countdown":
        round = null;
        qEl.textContent = "";
        opts.replaceChildren();
        share.replaceChildren();
        setStatus(az.live.countdown);
        return;
      case "round":
        startRound(m);
        return;
      case "lock":
        if (round && m.n === round.n) {
          round.locked = true;
          round.buttons.forEach((b) => { b.disabled = true; });
          setStatus(az.live.locked);
        }
        return;
      case "won":
        if (!round || m.n !== round.n) return;
        score = m.score;
        drawScore();
        settle(m.answer);
        setStatus(m.winner === slot ? az.live.wonYou : t("live.wonOpp", { nick: oppName() }));
        return;
      case "timeout":
        if (!round || m.n !== round.n) return;
        score = m.score;
        drawScore();
        settle(m.answer);
        setStatus(t("live.nobody", { answer: m.answer }));
        return;
      case "end":
        endView(m);
        return;
      case "error":
        setStatus(errText(m.code));
        if (m.code !== "full") retry.hidden = false;
        if (m.code === "full" || m.code === "ended") finished = true;
        return;
    }
  }

  async function connect() {
    await session().catch(() => {});
    const token = localStorage.getItem("bd_token");
    const sock = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/rooms/${code}/ws`);
    ws = sock;
    sock.onopen = () => sock.send(JSON.stringify({ t: "hello", token }));
    sock.onmessage = (e) => handle(JSON.parse(String(e.data)));
    sock.onclose = () => {
      if (leaving || finished || sock !== ws) return;
      setStatus(az.live.lost);
      retry.hidden = false;
    };
  }

  void connect();
}
