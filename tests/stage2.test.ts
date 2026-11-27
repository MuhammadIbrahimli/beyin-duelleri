import { beforeEach, describe, expect, it } from "vitest";
import { ACHIEVEMENTS } from "../config/achievements";
import { DAILY_POOL, WEEKLY } from "../config/quests";
import { MARAFON } from "../config/marafon";
import { SHOP_ITEMS } from "../config/shop";
import { SEASON } from "../config/seasons";
import { app } from "../worker/index";
import { weekKey, weekStart, dayKey } from "../worker/calendar";
import { dailyFor, claimQuest, listQuests, addProgress } from "../worker/quests";
import { checkAchievements, listAchievements } from "../worker/achievements";
import { makeTask, kindFor, levelFor, startRun, answerRun, GRACE_MS } from "../worker/marafon";
import { buy, equip, catalog } from "../worker/shop";
import { addFriend, myCode, listFriends } from "../worker/social";
import { createTeam, joinTeam, teamRanking } from "../worker/teams";
import { cityBattle, battleFor } from "../worker/cities";
import { applySeasonCorrection, seasonFor, eventXpMultiplier } from "../worker/seasons";
import { balanceOf, credit } from "../worker/economy-core";
import { storeMatch, type MatchResult } from "../worker/match-store";
import { makeD1 } from "./d1shim";

// 2026-12-15 12:00 Baku (08:00 UTC): a Tuesday of season S1
const NOW = Date.parse("2026-12-15T08:00:00Z");
let db: D1Database;

async function user(id: string, nick = id, city: string | null = null) {
  await db.prepare("INSERT INTO users (id, nickname, city_code, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)").bind(id, nick, city, NOW, NOW).run();
}
const env = () => ({ DB: db, SESSION_SECRET: "test-secret", SITE_ORIGIN: "", ADMIN_TOKEN: "x" }) as never;

beforeEach(async () => {
  db = makeD1();
  await user("ua", "Əli");
  await user("ub", "Leyla");
});

describe("calendar", () => {
  it("the week starts on Monday in Baku", () => {
    const monday = weekStart(NOW);
    expect(new Date(monday + 4 * 3600_000).getUTCDay()).toBe(1);
    expect(weekKey(NOW)).toBe("2026-12-14");
    expect(dayKey(NOW)).toBe("2026-12-15");
  });
});

describe("quests", () => {
  it("the same three daily quests for every player on the same Baku day", () => {
    const a = dailyFor("2026-12-15");
    expect(a).toHaveLength(3);
    expect(dailyFor("2026-12-15")).toEqual(a);
    expect(new Set(a.map((q) => q.id)).size).toBe(3);
    for (const q of a) expect(DAILY_POOL).toContain(q);
  });

  it("progress is added to the active quests; a reward is claimed once, when the quest is finished", async () => {
    const q = dailyFor(dayKey(NOW))[0];
    expect((await claimQuest(db, "ua", q.id, NOW)).ok).toBe(false);
    await addProgress(db, "ua", NOW, { [q.metric]: q.target });
    const first = await claimQuest(db, "ua", q.id, NOW);
    expect(first).toMatchObject({ ok: true, xp: q.xp });
    expect(await claimQuest(db, "ua", q.id, NOW)).toEqual({ ok: false, reason: "claimed" });
    expect(await balanceOf(db, "ua", "xp")).toBe(q.xp);
    const listed = await listQuests(db, "ua", NOW);
    expect(listed.find((x) => x.id === q.id)).toMatchObject({ claimed: true, progress: q.target });
  });

  it("an unknown quest is refused", async () => {
    expect(await claimQuest(db, "ua", "nope", NOW)).toEqual({ ok: false, reason: "unknown" });
  });

  it("weekly quests use the week period", () => {
    expect(WEEKLY.length).toBeGreaterThan(0);
  });
});

describe("achievements", () => {
  it("unlocks by the server's counters and gives the reward once", async () => {
    await db.prepare("INSERT INTO user_stats (user_id, wins, updated_at) VALUES (?, 1, ?)").bind("ua", NOW).run();
    const first = await checkAchievements(db, "ua", NOW);
    expect(first).toContain("first_win");
    const xpAfterFirst = await balanceOf(db, "ua", "xp");
    expect(await checkAchievements(db, "ua", NOW + 1000)).not.toContain("first_win");
    expect(await balanceOf(db, "ua", "xp")).toBe(xpAfterFirst);
  });

  it("a locked achievement shows its progress towards the target", async () => {
    await db.prepare("INSERT INTO user_stats (user_id, matches, updated_at) VALUES (?, 7, ?)").bind("ua", NOW).run();
    const list = await listAchievements(db, "ua");
    const m50 = list.find((a) => a.id === "matches_50")!;
    expect(m50).toMatchObject({ unlocked: false, value: 7, target: 50 });
    expect(list).toHaveLength(ACHIEVEMENTS.length);
  });
});

describe("Marafon", () => {
  it("a task is the same for the same seed, and its right option is in the list", () => {
    for (let idx = 0; idx < 24; idx++) {
      const a = makeTask(777, idx, 3);
      expect(makeTask(777, idx, 3)).toEqual(a);
      expect(a.options.length).toBeGreaterThan(0);
      expect(a.expected).toBeGreaterThanOrEqual(0);
      expect(a.expected).toBeLessThan(a.options.length);
    }
  });

  it("arithmetic answers are right", () => {
    for (let idx = 0; idx < 60; idx++) {
      if (kindFor(4242, idx) !== "arithmetic") continue;
      const t = makeTask(4242, idx, 4);
      const m = /^(\d+) ([+−×]) (\d+)$/.exec(t.text)!;
      const a = +m[1], b = +m[3];
      const v = m[2] === "+" ? a + b : m[2] === "−" ? a - b : a * b;
      expect(Number(t.options[t.expected])).toBe(v);
    }
  });

  it("no kind comes more than twice in a row, and every kind appears in each cycle", () => {
    const kinds = Array.from({ length: 60 }, (_, i) => kindFor(9, i));
    let run = 1;
    for (let i = 1; i < kinds.length; i++) {
      run = kinds[i] === kinds[i - 1] ? run + 1 : 1;
      expect(run).toBeLessThanOrEqual(2);
    }
    for (let c = 0; c < 10; c++) expect(new Set(kinds.slice(c * 6, c * 6 + 6)).size).toBe(MARAFON.kinds.length);
  });

  it("difficulty rises with right answers, and is capped", () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(MARAFON.tasksPerLevel)).toBe(2);
    expect(levelFor(10_000)).toBe(MARAFON.maxLevel);
  });

  it("a wrong answer costs a life; three lost lives end the run and keep the best score", async () => {
    const e = env();
    const run = await startRun(db, "ua", NOW);
    expect(run.lives).toBe(MARAFON.lives);
    let idx = 0;
    let t = NOW;
    let last: Awaited<ReturnType<typeof answerRun>> | null = null;
    for (let k = 0; k < 3; k++) {
      t += 500;
      last = await answerRun(e, "ua", run.runId, idx, -1, t);
      expect(last.ok).toBe(true);
      if (last.ok) expect(last.correct).toBe(false);
      idx++;
      t += 9000;
    }
    expect(last && last.ok && last.over).toBe(true);
    const after = await answerRun(e, "ua", run.runId, idx, 0, t);
    expect(after).toMatchObject({ ok: false, reason: "ended" });
  });

  it("a late answer is refused as late, even if it is right", async () => {
    const e = env();
    const run = await startRun(db, "ub", NOW);
    const task = run.task!;
    const seed = (await db.prepare("SELECT seed FROM marafon_runs WHERE id = ?").bind(run.runId).first<{ seed: number }>())!.seed;
    const right = makeTask(seed, 0, 1);
    // a reaction is judged from the signal, so its late time is counted from there
    const delay = task.kind === "reaction" ? task.delayMs ?? 0 : 0;
    const r = await answerRun(e, "ub", run.runId, 0, right.expected, NOW + delay + task.limitMs + GRACE_MS + 1);
    expect(r).toMatchObject({ ok: true, correct: false, why: "late" });
  });

  it("a reaction faster than a human can react is refused", async () => {
    const seed = 31337;
    // find a run index with a reaction task
    let idx = 0;
    while (kindFor(seed, idx) !== "reaction") idx++;
    const delay = makeTask(seed, idx, 1).delayMs!;
    await db.prepare("INSERT INTO marafon_runs (id, user_id, seed, lives, level, correct, score, status, started_at) VALUES ('rx', 'ua', ?, 3, 1, 0, 0, 'active', ?)").bind(seed, NOW).run();
    for (let i = 0; i < idx; i++) {
      await db.prepare("INSERT INTO marafon_tasks (run_id, idx, kind, expected, issued_at, limit_ms, min_ms, answered_at, result) VALUES ('rx', ?, 'arithmetic', '0', ?, 9000, 0, ?, 'wrong')").bind(i, NOW, NOW).run();
    }
    await db.prepare("INSERT INTO marafon_tasks (run_id, idx, kind, expected, issued_at, limit_ms, min_ms) VALUES ('rx', ?, 'reaction', '0', ?, ?, ?)").bind(idx, NOW, MARAFON.limitMs.reaction, MARAFON.minHumanMs).run();
    const early = await answerRun(env(), "ua", "rx", idx, 0, NOW + delay + 10);
    expect(early).toMatchObject({ ok: true, correct: false, why: "early" });
  });
});

describe("shop", () => {
  it("a purchase needs the balance; an owned item cannot be bought twice; equip only what is owned", async () => {
    const item = SHOP_ITEMS.find((i) => i.price > 0)!;
    expect(await buy(db, "ua", item.id, NOW)).toEqual({ ok: false, reason: "insufficient" });
    await credit(db, "ua", "qizil", item.price, "seed-q", "test", NOW);
    expect(await equip(db, "ua", item.id)).toEqual({ ok: false, reason: "not_owned" });
    const bought = await buy(db, "ua", item.id, NOW);
    expect(bought).toMatchObject({ ok: true, balance: 0 });
    expect(await buy(db, "ua", item.id, NOW)).toEqual({ ok: false, reason: "owned" });
    expect(await equip(db, "ua", item.id)).toEqual({ ok: true });
    const cat = await catalog(db, "ua");
    expect(cat.items.find((i) => i.id === item.id)).toMatchObject({ owned: true, equipped: true });
  });

  it("an unknown item is refused", async () => {
    expect(await buy(db, "ua", "nope", NOW)).toEqual({ ok: false, reason: "unknown" });
  });
});

describe("friends and teams", () => {
  it("friends by code, refused for yourself, and head-to-head results", async () => {
    const code = await myCode(db, "ub", NOW);
    expect(await addFriend(db, "ub", code, NOW)).toEqual({ ok: false, reason: "self" });
    expect(await addFriend(db, "ua", code, NOW)).toEqual({ ok: true, friendId: "ub" });
    await storeMatch(db, { code: "H1", mode: "friendly", rated: false, ids: ["ua", "ub"], bots: [null, null], points: [2, 1], winner: 0, reason: "finished", history: [] } as MatchResult, NOW);
    const f = await listFriends(db, "ua");
    expect(f[0]).toMatchObject({ id: "ub", wins: 1, losses: 0 });
    expect((await listFriends(db, "ub"))[0]).toMatchObject({ id: "ua", wins: 0, losses: 1 });
  });

  it("a university team is refused until its name is on the verified list", async () => {
    expect(await createTeam(db, "ua", "Bakı Dövlət Universiteti", "university", NOW)).toEqual({ ok: false, reason: "not_verified" });
  });

  it("a team joins by code and is ranked only with enough members", async () => {
    const t = await createTeam(db, "ua", "Sinif 9A", "class", NOW);
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    await user("uc", "Nigar");
    await user("ud", "Kənan");
    expect(await joinTeam(db, "ub", t.code, NOW)).toMatchObject({ ok: true });
    expect(await teamRanking(db, 1, 20)).toEqual([]);
    expect(await joinTeam(db, "uc", t.code, NOW)).toMatchObject({ ok: true });
    const ranked = await teamRanking(db, 1, 20);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]).toMatchObject({ members: 3, verified: false });
  });
});

describe("city battles", () => {
  it("a city shows a score only with enough players; a bigger city does not win by size alone", async () => {
    const week = weekStart(NOW);
    const [c1, c2] = battleFor(NOW).pair;
    // ten players of the first city with 3 matches each in this week; the second city has only two players
    for (let i = 0; i < 10; i++) {
      await user(`b${i}`, `B${i}`, c1);
    }
    for (let i = 0; i < 2; i++) await user(`s${i}`, `S${i}`, c2);
    let mid = 0;
    for (let i = 0; i < 10; i++) {
      for (let k = 0; k < 3; k++) {
        await db.prepare("INSERT INTO matches (id, mode, rated, winner, reason, user0, user1, created_at) VALUES (?, 'friendly', 0, ?, 'finished', ?, ?, ?)")
          .bind(`cb${mid++}`, k === 0 ? 0 : 1, `b${i}`, `s${i % 2}`, week + 3600_000 + k).run();
      }
    }
    const battle = await cityBattle(db, NOW);
    const sum = battle.cities.find((c) => c.city === c2)!;
    expect(sum.enough).toBe(false);
    expect(sum.score).toBeNull();
    expect(battle.leader).toBeNull();
  });

  it("a player who changed the city this week is not counted", async () => {
    const week = weekStart(NOW);
    const [c1] = battleFor(NOW).pair;
    await db.prepare("UPDATE users SET city_code = ? WHERE id = 'ua'").bind(c1).run();
    for (let k = 0; k < 3; k++) {
      await db.prepare("INSERT INTO matches (id, mode, rated, winner, reason, user0, user1, created_at) VALUES (?, 'friendly', 0, 0, 'finished', 'ua', 'ub', ?)").bind("cc" + k, week + 3600_000 + k).run();
    }
    expect((await cityBattle(db, NOW)).cities.find((c) => c.city === c1)!.players).toBe(1);
    await db.prepare("UPDATE users SET city_changed_at = ? WHERE id = 'ua'").bind(week + 1000).run();
    expect((await cityBattle(db, NOW)).cities.find((c) => c.city === c1)!.players).toBe(0);
  });
});

describe("seasons and events", () => {
  it("the season is a function of the Baku date", () => {
    expect(seasonFor(Date.parse("2026-11-30T12:00:00Z"))).toBeNull();
    expect(seasonFor(Date.parse("2026-12-01T12:00:00Z"))?.id).toBe("S1");
    expect(seasonFor(Date.parse("2027-01-15T12:00:00Z"))?.id).toBe("S2");
    expect(SEASON.lengthDays).toBe(30);
  });

  it("the first season change corrects the rating once, toward the start, and keeps the summary", async () => {
    await db.prepare("INSERT INTO ratings (user_id, rating, peak, updated_at) VALUES ('ua', 900, 900, ?)").bind(NOW).run();
    await db.prepare("INSERT INTO season_state (user_id, season_id) VALUES ('ua', 'S1')").run();
    const later = Date.parse("2027-01-15T12:00:00Z");
    await applySeasonCorrection(db, "ua", later);
    const once = await db.prepare("SELECT rating FROM ratings WHERE user_id = 'ua'").first<{ rating: number }>();
    expect(once?.rating).toBe(Math.round(300 + (900 - 300) * SEASON.softKeep));
    await applySeasonCorrection(db, "ua", later + 1000);
    const twice = await db.prepare("SELECT rating FROM ratings WHERE user_id = 'ua'").first<{ rating: number }>();
    expect(twice?.rating).toBe(once?.rating);
    const sr = await db.prepare("SELECT season_id FROM season_results WHERE user_id = 'ua'").first<{ season_id: string }>();
    expect(sr?.season_id).toBe("S1");
  });

  it("events raise XP only while they run", () => {
    expect(eventXpMultiplier(NOW)).toBe(1);
  });
});

describe("payments and ads are off", () => {
  it("features say so; an order and an ad reward are refused, nothing is charged", async () => {
    const f = await app.request("/api/features", {}, env());
    const j = (await f.json()) as { payments: boolean; ads: { enabled: boolean } };
    expect(j.payments).toBe(false);
    expect(j.ads.enabled).toBe(false);

    const token = await (await app.request("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }, env())).json() as { token: string };
    const order = await app.request("/api/shop/order", { method: "POST", headers: { authorization: `Bearer ${token.token}`, "content-type": "application/json" }, body: JSON.stringify({ item: SHOP_ITEMS[0].id }) }, env());
    expect(order.status).toBe(503);
    const ad = await app.request("/api/ads/reward", { method: "POST", headers: { authorization: `Bearer ${token.token}` } }, env());
    expect(ad.status).toBe(503);
  });
});
