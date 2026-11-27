// The one shared matchmaking queue (a single Durable Object, so there is one queue to pair from, not many rating pools).
// Players hold a WebSocket open while they search. The server pairs them by rating, widening the allowed difference
// as they wait, creates the room, and sends each player the room code. Nothing is polled: the queue ticks only
// while someone is waiting.
import { BOT_LEVEL_IDS, type BotLevel } from "../config/match";
import { MATCHMAKING } from "../config/matchmaking";
import type { Env } from "./env";
import { findPairs, botOffers, timedOut, type Entry } from "./matchmaking-core";
import { createMatchRoom, playerCard, ratingOf } from "./match-rooms";
import { verifyToken } from "./util";

const TICK_MS = 1000;

type Sock = { userId?: string };

export class Queue {
  private queue: Entry[] = [];
  private socks = new Map<WebSocket, Sock>();
  private byUser = new Map<string, WebSocket>();
  /** A player in a match cannot be paired again until the match is released (or the lock times out). */
  private locked = new Map<string, number>();
  private rematches = new Map<string, { opponent: string; at: number }>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/release" && request.method === "POST") {
      const body = await request.json<{ userIds?: unknown }>().catch(() => ({}) as { userIds?: unknown });
      for (const id of Array.isArray(body.userIds) ? body.userIds : []) if (typeof id === "string") this.locked.delete(id);
      return new Response("ok");
    }
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    this.socks.set(server, {});
    server.addEventListener("message", (e) => void this.onMessage(server, e.data));
    server.addEventListener("close", () => this.onGone(server));
    server.addEventListener("error", () => this.onGone(server));
    return new Response(null, { status: 101, webSocket: client });
  }

  private send(ws: WebSocket, msg: Record<string, unknown>) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* the socket is gone; its close handler cleans up */
    }
  }

  private fail(ws: WebSocket, code: string) {
    this.send(ws, { t: "error", code });
    try {
      ws.close(1008, code);
    } catch {
      /* already closed */
    }
  }

  private async onMessage(ws: WebSocket, raw: unknown) {
    const me = this.socks.get(ws);
    if (!me) return;
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(String(raw)) as Record<string, unknown>;
    } catch {
      return;
    }
    if (!me.userId) {
      if (m.t !== "hello") return this.fail(ws, "hello_first");
      const id = await verifyToken(this.env.SESSION_SECRET, typeof m.token === "string" ? m.token : null);
      if (!id || !this.socks.has(ws)) return this.fail(ws, "unauthorized");
      me.userId = id;
      this.byUser.set(id, ws);
      return this.send(ws, { t: "ready" });
    }
    const userId = me.userId;
    switch (m.t) {
      case "queue":
        return this.enqueue(ws, userId);
      case "cancel":
        this.queue = this.queue.filter((e) => e.userId !== userId);
        return this.send(ws, { t: "cancelled" });
      case "bot":
        return this.botMatch(ws, userId, m.level);
      case "rematch":
        return this.rematch(ws, userId, m.opponent);
      default:
        return;
    }
  }

  private async enqueue(ws: WebSocket, userId: string) {
    const mine = this.queue.find((e) => e.userId === userId);
    if (mine) return this.send(ws, { t: "queued", since: mine.joinedAt });
    if ((this.locked.get(userId) ?? 0) > Date.now()) return this.send(ws, { t: "error", code: "busy" });
    const rating = await ratingOf(this.env.DB, userId);
    // the player may have asked twice while the rating was being read
    if (this.queue.some((e) => e.userId === userId)) return;
    const now = Date.now();
    this.queue.push({ userId, rating, joinedAt: now, offeredBot: false });
    this.send(ws, { t: "queued", since: now, rating });
    this.ensureTick();
    void this.tryMatch();
  }

  /** A training match with a bot, offered when no opponent came. The bot is shown as a bot everywhere. */
  private async botMatch(ws: WebSocket, userId: string, level: unknown) {
    if (!BOT_LEVEL_IDS.includes(level as BotLevel)) return this.send(ws, { t: "error", code: "bad_level" });
    this.queue = this.queue.filter((e) => e.userId !== userId);
    const code = await createMatchRoom(this.env, { mode: "training", expect: [userId], bot: level as BotLevel });
    if (!code) return this.send(ws, { t: "error", code: "unavailable" });
    const me = await playerCard(this.env.DB, userId);
    this.send(ws, {
      t: "matched",
      code,
      mode: "training",
      me,
      opponent: { id: null, nick: `BOT · ${level}`, rating: null, league: null, bot: true, level },
    });
  }

  /** Revanş: both players ask within the wait; a finished match between them is needed, so strangers cannot rematch. */
  private async rematch(ws: WebSocket, userId: string, opponent: unknown) {
    if (typeof opponent !== "string" || opponent === userId) return;
    if ((this.locked.get(userId) ?? 0) > Date.now()) return this.send(ws, { t: "error", code: "busy" });
    const recent = await this.env.DB.prepare(
      "SELECT created_at FROM matches WHERE mode = 'rated' AND ((user0 = ? AND user1 = ?) OR (user0 = ? AND user1 = ?)) ORDER BY created_at DESC LIMIT 1",
    )
      .bind(userId, opponent, opponent, userId)
      .first<{ created_at: number }>();
    if (!recent || Date.now() - recent.created_at > 15 * 60 * 1000) return this.send(ws, { t: "error", code: "no_recent_match" });
    const now = Date.now();
    const asked = this.rematches.get(opponent);
    if (asked && asked.opponent === userId && now - asked.at <= MATCHMAKING.rematchWaitMs) {
      this.rematches.delete(opponent);
      if ((this.locked.get(opponent) ?? 0) > now) return this.send(ws, { t: "error", code: "busy" });
      // the repeat rule of the rating still applies to this rematch
      await this.startMatch(userId, opponent);
      return;
    }
    this.rematches.set(userId, { opponent, at: now });
    this.send(ws, { t: "rematch_wait" });
    const ows = this.byUser.get(opponent);
    if (ows) this.send(ows, { t: "rematch_request" });
  }

  private onGone(ws: WebSocket) {
    const me = this.socks.get(ws);
    this.socks.delete(ws);
    if (!me?.userId) return;
    if (this.byUser.get(me.userId) === ws) this.byUser.delete(me.userId);
    this.queue = this.queue.filter((e) => e.userId !== me.userId);
  }

  private ensureTick() {
    if (this.timer || this.queue.length === 0) return;
    this.timer = setTimeout(() => this.tick(), TICK_MS);
  }

  private tick() {
    this.timer = null;
    const now = Date.now();
    for (const e of botOffers(this.queue, now)) {
      e.offeredBot = true;
      const ws = this.byUser.get(e.userId);
      if (ws) this.send(ws, { t: "bot_offer", waited: now - e.joinedAt });
    }
    for (const e of timedOut(this.queue, now)) {
      this.queue = this.queue.filter((x) => x !== e);
      const ws = this.byUser.get(e.userId);
      if (ws) this.send(ws, { t: "timeout" });
    }
    for (const e of this.queue) {
      const ws = this.byUser.get(e.userId);
      if (ws) this.send(ws, { t: "searching", waited: now - e.joinedAt });
    }
    void this.tryMatch();
    this.ensureTick();
  }

  /** Pairs the waiting players. The queue is updated before any await, so one player is never paired twice. */
  private async tryMatch() {
    const pairs = findPairs(this.queue, Date.now());
    if (!pairs.length) return;
    const taken = new Set(pairs.flat().map((e) => e.userId));
    this.queue = this.queue.filter((e) => !taken.has(e.userId));
    await Promise.all(pairs.map(([a, b]) => this.startMatch(a.userId, b.userId)));
  }

  private async startMatch(a: string, b: string) {
    const now = Date.now();
    for (const id of [a, b]) this.locked.set(id, now + MATCHMAKING.matchLockMs);
    const code = await createMatchRoom(this.env, { mode: "rated", expect: [a, b], bot: null });
    const wa = this.byUser.get(a);
    const wb = this.byUser.get(b);
    if (!code) {
      for (const id of [a, b]) this.locked.delete(id);
      for (const ws of [wa, wb]) if (ws) this.send(ws, { t: "error", code: "unavailable" });
      return;
    }
    const [ca, cb] = await Promise.all([playerCard(this.env.DB, a), playerCard(this.env.DB, b)]);
    if (wa) this.send(wa, { t: "matched", code, mode: "rated", me: ca, opponent: cb });
    if (wb) this.send(wb, { t: "matched", code, mode: "rated", me: cb, opponent: ca });
  }
}
