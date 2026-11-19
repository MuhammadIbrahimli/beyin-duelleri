// Durable Object for one "İlk cavab" room. One instance per room code.
// Holds the sockets and timers; the rules live in rooms-core.ts.
import { hashString } from "../shared/rng";
import type { Env } from "./env";
import * as core from "./rooms-core";
import { verifyToken } from "./util";

type Client = { userId?: string; slot?: core.Slot };
type Msg = { t?: unknown; token?: unknown; round?: unknown; choice?: unknown };

export class Room {
  private room: core.Room | null = null;
  private socks: [WebSocket | null, WebSocket | null] = [null, null];
  private who = new Map<WebSocket, Client>();
  private roundEnd = 0;

  constructor(_state: DurableObjectState, private env: Env) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    if (!this.room) {
      const code = request.headers.get("x-room-code") ?? "";
      this.room = core.createRoom(hashString(code));
    }
    if (this.room.phase === "ended") return new Response("ended", { status: 410 });
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    this.who.set(server, {});
    server.addEventListener("message", (e) => void this.onMessage(server, e.data));
    server.addEventListener("close", () => this.onGone(server));
    server.addEventListener("error", () => this.onGone(server));
    return new Response(null, { status: 101, webSocket: client });
  }

  private async onMessage(ws: WebSocket, raw: unknown) {
    const me = this.who.get(ws);
    if (!me || !this.room) return;
    let m: Msg;
    try {
      m = JSON.parse(String(raw)) as Msg;
    } catch {
      return;
    }
    if (me.slot === undefined) {
      if (m.t !== "hello") return this.fail(ws, "hello_first");
      await this.join(ws, me, m.token);
      return;
    }
    if (m.t === "tap" && Number.isInteger(m.round) && Number.isInteger(m.choice)) {
      this.run(core.answer(this.room, me.slot, m.round as number, m.choice as number));
    }
  }

  private async join(ws: WebSocket, me: Client, token: unknown) {
    const room = this.room!;
    const userId = await verifyToken(this.env.SESSION_SECRET, typeof token === "string" ? token : null);
    if (!userId) return this.fail(ws, "unauthorized");
    if (!this.who.has(ws)) return; // closed while the token was checked
    const row = await this.env.DB.prepare("SELECT nickname FROM users WHERE id = ?").bind(userId).first<{ nickname: string }>();
    const nick = row?.nickname ?? "?";
    const out = core.join(room, userId, nick);
    if (out.error) return this.fail(ws, out.error);
    const slot = room.ids.indexOf(userId) as core.Slot;
    const old = this.socks[slot];
    if (old && old !== ws) {
      this.who.delete(old);
      old.close(1000, "replaced");
    }
    this.socks[slot] = ws;
    me.userId = userId;
    me.slot = slot;
    this.run(out);
    // a player who comes back in the middle of a round gets the question again, with the time left
    if (room.phase === "round") {
      const q = room.qs[room.round - 1];
      const ms = Math.max(0, this.roundEnd - Date.now());
      ws.send(JSON.stringify({ t: "round", n: room.round, total: core.ROUNDS, text: q.text, options: q.options, ms }));
    }
  }

  private onGone(ws: WebSocket) {
    const me = this.who.get(ws);
    this.who.delete(ws);
    if (!me || me.slot === undefined || !this.room) return;
    if (this.socks[me.slot] !== ws) return; // a newer connection already took this seat
    this.socks[me.slot] = null;
    this.run(core.leave(this.room, me.slot));
  }

  private fail(ws: WebSocket, code: string) {
    try {
      ws.send(JSON.stringify({ t: "error", code }));
      ws.close(1008, code);
    } catch {
      /* already closed */
    }
  }

  private run(out: core.Out) {
    if (out.error) return;
    for (const e of out.events) this.emit(e);
    for (const t of out.timers) this.schedule(t);
    if (out.room.phase === "ended") this.closeAll();
  }

  private emit(e: core.Ev) {
    if (e.msg.t === "round") this.roundEnd = Date.now() + core.ROUND_MS;
    const data = JSON.stringify(e.msg);
    const targets = e.to === "all" ? this.socks : [this.socks[e.to]];
    for (const s of targets) {
      try {
        s?.send(data);
      } catch {
        /* the socket is gone; its close handler will clean up */
      }
    }
  }

  private schedule(t: core.Timer) {
    const room = this.room!;
    setTimeout(() => {
      switch (t.kind) {
        case "countdown":
          return this.run(core.countdownDone(room));
        case "round":
          return this.run(core.roundTimeout(room, t.round!));
        case "next":
          return this.run(core.nextTimeout(room, t.round!));
        case "away":
          return this.run(core.awayTimeout(room, t.slot!));
      }
    }, t.ms);
  }

  private closeAll() {
    for (const s of this.socks) {
      try {
        s?.close(1000, "over");
      } catch {
        /* already closed */
      }
    }
  }
}
