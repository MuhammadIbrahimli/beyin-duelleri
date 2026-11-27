// Shared helpers for the multi-discipline match: creating its room, the player cards shown on the VS screen,
// and releasing the players' locks when a match is over.
import { RATING } from "../config/rating";
import type { BotLevel } from "../config/match";
import type { Env } from "./env";
import { leagueOf } from "./rating-core";
import { equippedOf, itemById } from "./shop";
import { newDuelCode, newSeed } from "./util";

export interface MatchOpts {
  mode: "rated" | "friendly" | "training";
  expect: string[] | null;
  bot?: BotLevel | null;
}

/** Creates a room for a match inside its Durable Object and returns the code the players connect with. */
export async function createMatchRoom(env: Env, opts: MatchOpts): Promise<string | null> {
  if (!env.ROOMS) return null;
  const code = newDuelCode(6).toUpperCase();
  const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
  const res = await stub.fetch("https://room/init", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ game: "multi", seed: newSeed(), code, opts }),
  });
  return res.ok ? code : null;
}

export async function ratingOf(db: D1Database, userId: string): Promise<number> {
  const row = await db.prepare("SELECT rating FROM ratings WHERE user_id = ?").bind(userId).first<{ rating: number }>();
  return row?.rating ?? RATING.start;
}

export interface PlayerCard {
  id: string;
  nick: string;
  rating: number;
  league: string;
  bot: boolean;
  /** the look class of the equipped avatar, or null */
  avatar: string | null;
}

/** What the VS screen shows about a player. Only public data: name, rating, league. */
export async function playerCard(db: D1Database, userId: string): Promise<PlayerCard> {
  const row = await db
    .prepare("SELECT u.nickname AS nick, COALESCE(r.rating, ?) AS rating FROM users u LEFT JOIN ratings r ON r.user_id = u.id WHERE u.id = ?")
    .bind(RATING.start, userId)
    .first<{ nick: string; rating: number }>();
  const rating = row?.rating ?? RATING.start;
  const eq = await equippedOf(db, userId);
  const look = eq.avatar ? itemById(eq.avatar)?.look ?? null : null;
  return { id: userId, nick: row?.nick ?? "?", rating, league: leagueOf(rating), bot: false, avatar: look };
}

/** Releases the players of a finished match from the queue's match lock (see worker/queue.ts). */
export async function releasePlayers(env: Env, userIds: string[]): Promise<void> {
  if (!env.QUEUE || !userIds.length) return;
  await env.QUEUE.get(env.QUEUE.idFromName("global")).fetch("https://queue/release", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userIds }),
  });
}
