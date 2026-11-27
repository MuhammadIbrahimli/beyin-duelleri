import { beforeEach, describe, expect, it } from "vitest";
import { ECONOMY, levelForXp, xpForLevel } from "../config/economy";
import { RATING } from "../config/rating";
import { balanceOf, bakuDay, bakuDayStart, credit, debit } from "../worker/economy-core";
import { storeMatch, type MatchResult } from "../worker/match-store";
import { makeD1 } from "./d1shim";

const NOW = Date.UTC(2026, 10, 27, 10, 0); // 14:00 in Baku
let db: D1Database;

async function user(id: string, nick = id) {
  await db.prepare("INSERT INTO users (id, nickname, created_at, last_seen_at) VALUES (?, ?, ?, ?)").bind(id, nick, NOW, NOW).run();
}

function match(code: string, over: Partial<MatchResult> = {}): MatchResult {
  return {
    code,
    mode: "rated",
    rated: true,
    ids: ["ua", "ub"],
    bots: [null, null],
    points: [3, 1],
    winner: 0,
    reason: "finished",
    history: [
      { id: "reaction", winner: 0, score: [2, 1] },
      { id: "memory", winner: 1, score: [0, 1] },
      { id: "math", winner: 0, score: [3, 1] },
      { id: "attention", winner: 0, score: [1, 0] },
      { id: "logic", winner: -1, score: [0, 0] },
    ],
    ...over,
  };
}

beforeEach(async () => {
  db = makeD1();
  await user("ua", "Əli");
  await user("ub", "Leyla");
});

describe("the Qızıl ledger", () => {
  it("a reward is applied once: the same reference twice changes the balance once", async () => {
    expect(await credit(db, "ua", "qizil", 10, "ref-1", "match", NOW)).toBe(true);
    expect(await credit(db, "ua", "qizil", 10, "ref-1", "match", NOW)).toBe(false);
    expect(await balanceOf(db, "ua", "qizil")).toBe(10);
  });

  it("a purchase with too little balance is refused and leaves no ledger row", async () => {
    await credit(db, "ua", "qizil", 5, "ref-2", "match", NOW);
    expect(await debit(db, "ua", "qizil", 9, "buy-1", "purchase", NOW)).toBe("insufficient");
    expect(await balanceOf(db, "ua", "qizil")).toBe(5);
    const rows = await db.prepare("SELECT COUNT(*) AS n FROM econ_ledger WHERE ref = 'buy-1'").first<{ n: number }>();
    expect(rows?.n).toBe(0);
  });

  it("a purchase with enough balance takes the amount, once", async () => {
    await credit(db, "ua", "qizil", 20, "ref-3", "match", NOW);
    expect(await debit(db, "ua", "qizil", 12, "buy-2", "purchase", NOW)).toBe("ok");
    expect(await debit(db, "ua", "qizil", 12, "buy-2", "purchase", NOW)).toBe("duplicate");
    expect(await balanceOf(db, "ua", "qizil")).toBe(8);
  });

  it("the balance can never go negative: a second purchase for the same coins is refused", async () => {
    await credit(db, "ua", "qizil", 10, "ref-4", "match", NOW);
    const results = [await debit(db, "ua", "qizil", 10, "race-a", "purchase", NOW), await debit(db, "ua", "qizil", 10, "race-b", "purchase", NOW)];
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    expect(await balanceOf(db, "ua", "qizil")).toBe(0);
  });

  it("the Baku day starts at 00:00 local time (UTC+4)", () => {
    expect(bakuDay(NOW)).toBe("2026-11-27");
    expect(bakuDayStart(NOW)).toBe(Date.UTC(2026, 10, 26, 20, 0));
  });
});

describe("account level", () => {
  it("levels get harder: each step needs more XP than the one before", () => {
    for (let l = 1; l < 20; l++) expect(xpForLevel(l + 1) - xpForLevel(l)).toBeGreaterThan(xpForLevel(l) - xpForLevel(l - 1) - 1);
  });

  it("the level and the progress into it follow from the total XP", () => {
    expect(levelForXp(0)).toEqual({ level: 1, into: 0, need: ECONOMY.xpBase });
    const l2 = xpForLevel(2);
    expect(levelForXp(l2 - 1).level).toBe(1);
    expect(levelForXp(l2)).toMatchObject({ level: 2, into: 0 });
  });
});

describe("storing a finished match", () => {
  it("stores the match once: the second write changes nothing (no double rating, no double reward)", async () => {
    expect(await storeMatch(db, match("M1"), NOW)).toBe(true);
    expect(await storeMatch(db, match("M1"), NOW + 1000)).toBe(false);
    const xp = await balanceOf(db, "ua", "xp");
    expect(xp).toBeGreaterThan(0);
    const again = await storeMatch(db, match("M1"), NOW + 2000);
    expect(again).toBe(false);
    expect(await balanceOf(db, "ua", "xp")).toBe(xp);
    const hist = await db.prepare("SELECT COUNT(*) AS n FROM rating_history WHERE match_id = 'M1'").first<{ n: number }>();
    expect(hist?.n).toBe(2);
  });

  it("a rated win moves the ratings by the Elo change; the loser goes down by the same amount (zero-sum)", async () => {
    await storeMatch(db, match("M2"), NOW);
    const a = await db.prepare("SELECT rating, wins, losses, played FROM ratings WHERE user_id = 'ua'").first<{ rating: number; wins: number; losses: number; played: number }>();
    const b = await db.prepare("SELECT rating, wins, losses FROM ratings WHERE user_id = 'ub'").first<{ rating: number; wins: number; losses: number }>();
    expect(a).toMatchObject({ wins: 1, losses: 0, played: 1 });
    expect(b).toMatchObject({ wins: 0, losses: 1 });
    expect(a!.rating + b!.rating).toBe(RATING.start * 2);
    expect(a!.rating).toBeGreaterThan(RATING.start);
    const m = await db.prepare("SELECT delta0, delta1, rated FROM matches WHERE id = 'M2'").first<{ delta0: number; delta1: number; rated: number }>();
    expect(m).toMatchObject({ rated: 1 });
    expect(m!.delta0 + m!.delta1).toBe(0);
  });

  it("a draw in a rated match gives both the same score and no rating change between equals", async () => {
    await storeMatch(db, match("M3", { winner: -1, points: [0, 0] }), NOW);
    const a = await db.prepare("SELECT rating, draws FROM ratings WHERE user_id = 'ua'").first<{ rating: number; draws: number }>();
    expect(a).toMatchObject({ rating: RATING.start, draws: 1 });
  });

  it("a bot match is not rated, and the human only gets the small training XP", async () => {
    const r = match("M4", {
      mode: "training",
      rated: false,
      ids: ["ua", "bot:ekspert:1"],
      bots: [null, "ekspert"],
      winner: 1,
      points: [0, 3],
    });
    await storeMatch(db, r, NOW);
    expect(await balanceOf(db, "ua", "qizil")).toBe(0);
    expect(await balanceOf(db, "ua", "xp")).toBe(ECONOMY.bot.xpPerMatch);
    const rated = await db.prepare("SELECT COUNT(*) AS n FROM ratings WHERE user_id = 'ua'").first<{ n: number }>();
    expect(rated?.n).toBe(0);
  });

  it("training XP has a daily cap, so bot matches cannot be farmed", async () => {
    for (let i = 0; i < 10; i++) {
      await storeMatch(db, { ...match(`B${i}`), mode: "training", rated: false, ids: ["ua", `bot:asan:${i}`], bots: [null, "asan"] }, NOW + i);
    }
    expect(await balanceOf(db, "ua", "xp")).toBe(ECONOMY.bot.dailyXpCap);
  });

  it("after the daily limit of matches, a player still plays but gets no rewards", async () => {
    for (let i = 0; i < ECONOMY.matchesPerDay; i++) await storeMatch(db, match(`D${i}`, { mode: "friendly", rated: false }), NOW + i);
    const before = await balanceOf(db, "ua", "xp");
    await storeMatch(db, match("D-extra", { mode: "friendly", rated: false }), NOW + 100);
    expect(await balanceOf(db, "ua", "xp")).toBe(before);
  });

  it("a friendly match gives XP but never Qızıl", async () => {
    await storeMatch(db, match("F1", { mode: "friendly", rated: false }), NOW);
    expect(await balanceOf(db, "ua", "xp")).toBeGreaterThan(0);
    // the match itself gives no Qızıl (the balance may hold an achievement reward, which is a different reason)
    const q = await db.prepare("SELECT COUNT(*) AS n FROM econ_ledger WHERE user_id = 'ua' AND currency = 'qizil' AND reason = 'match'").first();
    expect(q?.n).toBe(0);
  });

  it("a rated match gives Qızıl to both players", async () => {
    await storeMatch(db, match("R1"), NOW);
    expect(await balanceOf(db, "ua", "qizil")).toBeGreaterThan(0);
    expect(await balanceOf(db, "ub", "qizil")).toBeGreaterThan(0);
  });

  it("repeated rated matches between the same two accounts stop changing ratings", async () => {
    for (let i = 0; i < RATING.repeatLimit; i++) await storeMatch(db, match(`P${i}`), NOW + i);
    const before = await db.prepare("SELECT rating FROM ratings WHERE user_id = 'ua'").first<{ rating: number }>();
    await storeMatch(db, match("P-farm"), NOW + 50);
    const after = await db.prepare("SELECT rating FROM ratings WHERE user_id = 'ua'").first<{ rating: number }>();
    expect(after?.rating).toBe(before?.rating);
    const flag = await db.prepare("SELECT flag FROM matches WHERE id = 'P-farm'").first<{ flag: string | null }>();
    expect(flag?.flag).toBe("repeat");
  });

  it("a forfeit counts as a rated loss for the one who left", async () => {
    await storeMatch(db, match("X1", { winner: 0, reason: "forfeit" }), NOW);
    const b = await db.prepare("SELECT losses FROM ratings WHERE user_id = 'ub'").first<{ losses: number }>();
    expect(b?.losses).toBe(1);
  });
});
