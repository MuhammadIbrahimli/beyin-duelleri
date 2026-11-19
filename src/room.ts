// Live rooms. One shell handles the seats, the score, the lobby and reconnects; one view per game draws the rounds.
// The server says which game the room plays (a "game" message right after hello), and the shell picks the view.
import "./room.css";
import { api, session } from "./api";
import { h, mount } from "./dom";
import { az, t } from "./i18n";
import { go, onLeave } from "./router";
import { memoryView } from "./memory";
import { raceView } from "./race";
import { reactionView } from "./reaction";
import { riddleView } from "./riddle";

const app = () => document.getElementById("app")!;
const CODE = /^[A-Z0-9]{4,8}$/;
export type Slot = 0 | 1;

/** What a game view can use from the shell. */
export interface Ctx {
  body: HTMLElement;
  send(o: Record<string, unknown>): void;
  setStatus(s: string): void;
  slot(): Slot | null;
  nick(s: Slot): string;
}
export interface View { handle(m: any): void }

export const errText = (code?: string) => (az.live.err as Record<string, string>)[code ?? ""] ?? az.common.error;

export type LiveGame = "first" | "grid" | "memory" | "reaction" | "riddle";

/** Creates a room for one of the live games; the caller opens it with go(`/r/${code}`). */
export async function createRoom(game: LiveGame): Promise<string> {
  const r = await api<{ code: string }>("POST", "/rooms", { game });
  return r.code;
}

/** The room itself: lobby, countdown, the game's rounds and the result. */
export function roomPage(codeRaw: string) {
  const code = codeRaw.toUpperCase();
  const scoreEl = h("div", { class: "room-score" });
  const status = h("p", { class: "soft", role: "status", "aria-live": "polite" });
  const share = h("div", { class: "room-share" });
  const body = h("div", { class: "room-body" });
  const again = h("button", { class: "btn primary block", hidden: true, onclick: () => go("/duels") }, az.live.again);
  const retry = h("button", { class: "btn block", hidden: true, onclick: () => { retry.hidden = true; void connect(); } }, az.live.reconnect);
  mount(app(), h("div", { class: "screen room" }, scoreEl, status, share, body, again, retry));
  if (!CODE.test(code)) { status.textContent = az.live.err.bad_code; return; }

  let ws: WebSocket | null = null;
  let slot: Slot | null = null;
  let nicks: [string, string] = ["", ""];
  let score: [number, number] = [0, 0];
  let view: View | null = null;
  let finished = false;
  let leaving = false;
  onLeave(() => { leaving = true; ws?.close(); });

  const setStatus = (s: string) => { status.textContent = s; };
  const send = (o: Record<string, unknown>) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o)); };
  const ctx: Ctx = { body, send, setStatus, slot: () => slot, nick: (s) => nicks[s] || az.live.opp };
  const opp = (): Slot => (slot === 0 ? 1 : 0);

  function drawScore() {
    if (slot === null) { scoreEl.replaceChildren(); return; }
    scoreEl.replaceChildren(
      h("span", null, az.live.you),
      h("strong", null, `${score[slot]} : ${score[opp()]}`),
      h("span", null, nicks[opp()] || az.live.opp),
    );
  }

  function showShare() {
    const url = `${location.origin}/r/${code}`;
    const copy = h("button", { class: "btn block", onclick: () => {
      void navigator.clipboard?.writeText(url).then(() => { copy.textContent = az.live.copied; }).catch(() => {});
    } }, az.live.copy);
    const sharing = typeof navigator.share === "function"
      ? h("button", { class: "btn primary block", onclick: () => {
          void navigator.share({ title: az.app.name, text: t("live.shareText", { code }), url }).catch(() => {});
        } }, az.live.share)
      : null;
    share.replaceChildren(h("p", { class: "room-code" }, code), copy, ...(sharing ? [sharing] : []));
  }

  const endText = (m: any) => {
    const title = m.winner === -1 ? az.live.draw : m.winner === slot ? az.live.winYou : t("live.winOpp", { nick: nicks[opp()] || az.live.opp });
    const sub = m.reason === "forfeit" ? (m.winner === slot ? az.live.forfeitWin : az.live.forfeitLose) : "";
    return [az.live.endTitle, title, sub].filter(Boolean).join(". ");
  };

  function handle(m: any) {
    if (m.t === "game") {
      view = m.game === "grid" ? raceView(ctx)
        : m.game === "memory" ? memoryView(ctx)
        : m.game === "reaction" ? reactionView(ctx)
        : m.game === "riddle" ? riddleView(ctx)
        : firstView(ctx);
      return;
    }
    if (m.t === "error") {
      setStatus(errText(m.code));
      if (m.code !== "full") retry.hidden = false;
      if (m.code === "full" || m.code === "ended") finished = true;
      return;
    }
    if (m.t === "welcome") {
      slot = m.slot as Slot;
      nicks = m.state.nicks;
      score = m.state.score;
      drawScore();
      if (m.state.phase === "lobby") { setStatus(az.live.waitSub); showShare(); }
      return;
    }
    if (m.t === "opponent" && slot !== null) {
      if (m.state === "joined") { nicks[opp()] = m.nick; drawScore(); setStatus(t("live.joined", { nick: m.nick })); }
      if (m.state === "back") setStatus(t("live.back", { nick: nicks[opp()] || az.live.opp }));
      if (m.state === "away") setStatus(t("live.away", { nick: nicks[opp()] || az.live.opp, s: Math.round(m.ms / 1000) }));
      return;
    }
    if (m.t === "countdown") { share.replaceChildren(); setStatus(az.live.countdown); }
    if (m.t === "end") { finished = true; again.hidden = false; setStatus(endText(m)); }
    if (Array.isArray(m.score)) { score = m.score; drawScore(); }
    view?.handle(m);
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

/** "İlk cavab": one question for both, the first correct tap wins the round. */
function firstView(ctx: Ctx): View {
  const bar = h("div", { class: "room-bar" });
  const track = h("div", { class: "room-track" }, bar);
  const qEl = h("div", { class: "room-q" });
  const opts = h("div", { class: "opts" });
  ctx.body.replaceChildren(track, qEl, opts);
  let round: { n: number; options: number[]; buttons: HTMLButtonElement[]; decided: boolean; locked: boolean } | null = null;

  const tap = (i: number) => {
    if (!round || round.decided || round.locked) return;
    ctx.send({ t: "tap", round: round.n, choice: i });
  };
  const settle = (answer?: number) => {
    if (!round) return;
    round.decided = true;
    round.buttons.forEach((b) => { b.disabled = true; });
    if (answer !== undefined) round.buttons[round.options.indexOf(answer)]?.classList.add("good");
    bar.style.animationPlayState = "paused";
  };

  const handle = (m: any) => {
    switch (m.t) {
      case "round": {
        const options = m.options as number[];
        const buttons = options.map((v, i) => h("button", { class: "btn opt-wide", onclick: () => tap(i) }, String(v)) as HTMLButtonElement);
        round = { n: m.n, options, buttons, decided: false, locked: false };
        opts.replaceChildren(...buttons);
        qEl.textContent = m.text;
        ctx.setStatus(t("live.round", { n: m.n, total: m.total }) + " · " + az.live.pick);
        // the bar drains over the time the server gave; a reconnect passes the time left
        bar.style.animation = "none";
        void bar.offsetWidth;
        bar.style.animation = `room-drain ${Math.max(0, m.ms)}ms linear forwards`;
        return;
      }
      case "countdown":
        round = null;
        qEl.textContent = "";
        opts.replaceChildren();
        return;
      case "lock":
        if (round && m.n === round.n) {
          round.locked = true;
          round.buttons.forEach((b) => { b.disabled = true; });
          ctx.setStatus(az.live.locked);
        }
        return;
      case "won":
        if (!round || m.n !== round.n) return;
        settle(m.answer);
        ctx.setStatus(m.winner === ctx.slot() ? az.live.wonYou : t("live.wonOpp", { nick: ctx.nick(m.winner) }));
        return;
      case "timeout":
        if (!round || m.n !== round.n) return;
        settle(m.answer);
        ctx.setStatus(t("live.nobody", { answer: m.answer }));
        return;
      case "end":
        settle();
        track.hidden = true;
        qEl.textContent = "";
        opts.replaceChildren();
        return;
    }
  };
  return { handle };
}
