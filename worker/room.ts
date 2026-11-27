// Durable Object for one live room (one instance per room code). It holds the sockets and the timers;
// the rules of the game live in the engine it was created with (rooms-core for "first", race-core for "grid").
import { GAME_IDS, TIMED_MESSAGES, type Engine, type Ev, type GameId, type Out, type Slot, type Timer } from "./engine";
import type { Env } from "./env";
import { memoryEngine } from "./memory-core";
import { reactionEngine } from "./reaction-core";
import { riddleEngine } from "./riddle-core";
import { raceEngine } from "./race-core";
import { firstEngine } from "./rooms-core";
import { duel5Engine } from "./duel5-core";
import { storeMatch, type MatchResult } from "./match-store";
import { releasePlayers } from "./match-rooms";
import { verifyToken } from "./util";

export const GAMES: Record<GameId, Engine<unknown>> = {
  first: firstEngine as unknown as Engine<unknown>,
  grid: raceEngine as unknown as Engine<unknown>,
  memory: memoryEngine as unknown as Engine<unknown>,
  reaction: reactionEngine as unknown as Engine<unknown>,
  riddle: riddleEngine as unknown as Engine<unknown>,
  multi: duel5Engine as unknown as Engine<unknown>,
};
/** A room of the multi-discipline match is closed if the second player never comes (see duel5-core). */
const LOBBY_TIMER_GAME: GameId = "multi";
const isGame = (g: unknown): g is GameId => (GAME_IDS as readonly unknown[]).includes(g);

type Client = { userId?: string; slot?: Slot };
const LOBBY_MS = 30000;

export class Room {
  private game: GameId | null = null;
  private engine: Engine<unknown> | null = null;
  private room: unknown = null;
  private socks: [WebSocket | null, WebSocket | null] = [null, null];
  private who = new Map<WebSocket, Client>();
  private roundEnd = 0;

  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(request: Request): Promise<Response> {
    // Only the Worker calls /init (see routes/rooms.ts); sockets come in on the room's /ws path.
    if (new URL(request.url).pathname === "/init") return this.init(request);
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    if (!this.engine) return new Response("unknown room", { status: 404 });
    if (this.engine.ended(this.room)) return new Response("ended", { status: 410 });
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

  private async init(request: Request): Promise<Response> {
    if (this.engine) return new Response("exists", { status: 409 });
    const b = await request
      .json<{ game?: unknown; seed?: unknown; code?: unknown; opts?: unknown }>()
      .catch(() => ({}) as { game?: unknown; seed?: unknown; code?: unknown; opts?: unknown });
    if (!isGame(b.game) || typeof b.seed !== "number") return new Response("bad init", { status: 400 });
    this.game = b.game;
    this.engine = GAMES[b.game];
    if (this.engine.setup) {
      const opts = { ...((b.opts as Record<string, unknown>) ?? {}), code: typeof b.code === "string" ? b.code : "" };
      this.room = this.engine.setup(b.seed, opts);
    } else {
      this.room = this.engine.create(b.seed);
    }
    if (this.game === LOBBY_TIMER_GAME) this.schedule({ kind: "lobby", ms: LOBBY_MS });
    return new Response("ok");
  }

  private async onMessage(ws: WebSocket, raw: unknown) {
    const me = this.who.get(ws);
    if (!me || !this.engine) return;
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(String(raw)) as Record<string, unknown>;
    } catch {
      return;
    }
    if (me.slot === undefined) {
      if (m.t !== "hello") return this.fail(ws, "hello_first");
      await this.join(ws, me, m.token);
      return;
    }
    this.run(this.engine.act(this.room, me.slot, m, Date.now()));
  }

  private async join(ws: WebSocket, me: Client, token: unknown) {
    const engine = this.engine!;
    const room = this.room;
    const userId = await verifyToken(this.env.SESSION_SECRET, typeof token === "string" ? token : null);
    if (!userId) return this.fail(ws, "unauthorized");
    if (!this.who.has(ws)) return; // closed while the token was checked
    const row = await this.env.DB.prepare("SELECT nickname FROM users WHERE id = ?").bind(userId).first<{ nickname: string }>();
    const nick = row?.nickname ?? "?";
    // the game comes first, so the client builds the right screen before the seat message
    ws.send(JSON.stringify({ t: "game", game: this.game }));
    const out = engine.join(room, userId, nick);
    if (out.error) return this.fail(ws, out.error);
    const welcome = out.events.find((e) => e.msg.t === "welcome");
    const slot = welcome?.to as Slot;
    const old = this.socks[slot];
    if (old && old !== ws) {
      this.who.delete(old);
      old.close(1000, "replaced");
    }
    this.socks[slot] = ws;
    me.userId = userId;
    me.slot = slot;
    this.run(out);
    // a player who comes back in the middle of a round gets the round again, with the time left
    if (engine.inRound(room)) {
      for (const e of engine.resume(room, slot, Math.max(0, this.roundEnd - Date.now()))) this.emit(e);
    }
  }

  private onGone(ws: WebSocket) {
    const me = this.who.get(ws);
    this.who.delete(ws);
    if (!me || me.slot === undefined || !this.engine) return;
    if (this.socks[me.slot] !== ws) return; // a newer connection already took this seat
    this.socks[me.slot] = null;
    this.run(this.engine.leave(this.room, me.slot));
  }

  private fail(ws: WebSocket, code: string) {
    try {
      ws.send(JSON.stringify({ t: "error", code }));
      ws.close(1008, code);
    } catch {
      /* already closed */
    }
  }

  private run(out: Out<unknown>) {
    if (out.error) return;
    for (const e of out.events) this.emit(e);
    for (const t of out.timers) this.schedule(t);
    // a finished match is stored once, in the background; the store is idempotent (see match-store.ts)
    if (out.result) {
      const res = out.result as MatchResult;
      const stored = storeMatch(this.env.DB, res, Date.now()).catch((e) => console.error("store match", e));
      const humans = res.ids.filter((id, s): id is string => !!id && !res.bots[s as 0 | 1]);
      const released = releasePlayers(this.env, humans).catch((e) => console.error("release players", e));
      this.state.waitUntil(Promise.all([stored, released]));
    }
    // a match nobody joined closes without a result: its players are released from the queue lock as well
    if (this.game === "multi" && (out.room as { reason?: string }).reason === "no_show") {
      const seated = (out.room as { ids: [string | null, string | null] }).ids.filter((id): id is string => !!id);
      this.state.waitUntil(releasePlayers(this.env, seated).catch((e) => console.error("release players", e)));
    }
    if (this.engine?.ended(out.room)) this.closeAll();
  }

  private emit(e: Ev) {
    if (TIMED_MESSAGES.has(String(e.msg.t))) this.roundEnd = Date.now() + Number(e.msg.ms);
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

  private schedule(t: Timer) {
    const engine = this.engine!;
    const room = this.room;
    setTimeout(() => this.run(engine.timer(room, t, Date.now())), t.ms);
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
