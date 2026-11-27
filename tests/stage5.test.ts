import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../worker/index";
import { todayBaku } from "../shared/experiments";
import { bySlug, dailySlug } from "../shared/experiments";
import { makeD1 } from "./d1shim";
import { claimStreak, streakState } from "../worker/streak";
import { skillsFor, SKILL_MIN_EXPERIMENTS } from "../worker/skills";
import { dailyBoard } from "../worker/daily-board";
import { createTeam, joinTeam, teamRanking } from "../worker/teams";
import { inviteToTeam, respondInvite, react, myTeamInvites, reactionsReceived } from "../worker/friend-extras";
import { addFriend, myCode } from "../worker/social";
import { notificationsFor } from "../worker/notifications";
import { seasonRewardFor } from "../config/season-rewards";
import { applySeasonCorrection } from "../worker/seasons";
import { balanceOf } from "../worker/economy-core";
import { UNIVERSITIES } from "../config/universities";

// 2026-12-15 12:00 Baku
const NOW = Date.parse("2026-12-15T08:00:00Z");
const TODAY = todayBaku(NOW);
let db: D1Database;

async function user(id: string, nick = id, city: string | null = null) {
  await db.prepare("INSERT INTO users (id, nickname, city_code, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)").bind(id, nick, city, NOW, NOW).run();
}
const dayAgo = (n: number) => new Date(Date.parse(TODAY + "T00:00:00Z") - n * 86400000).toISOString().slice(0, 10);

beforeEach(async () => {
  db = makeD1();
  await user("ua", "Əli");
  await user("ub", "Leyla");
  await user("uc", "Nigar");
});

describe("streak rewards", () => {
  async function addDaily(uid: string, date: string) {
    const run = `run-${uid}-${date}`;
    await db.prepare("INSERT INTO runs (id, user_id, experiment_id, seed, status, primary_score, valid, created_at, finished_at) VALUES (?, ?, 1, 1, 'finished', 1, 1, ?, ?)")
      .bind(run, uid, NOW, NOW).run();
    await db.prepare("INSERT INTO daily (user_id, date, run_id) VALUES (?, ?, ?)").bind(uid, date, run).run();
  }

  it("a milestone is claimed once; a broken streak keeps the claimed reward", async () => {
    for (const d of [0, 1, 2]) await addDaily("ua", dayAgo(d));
    const before = await streakState(db, "ua", NOW);
    expect(before.streak).toBe(3);
    expect(await claimStreak(db, "ua", 3, NOW)).toEqual({ ok: true, xp: 20, qizil: 10 });
    expect(await claimStreak(db, "ua", 3, NOW)).toEqual({ ok: false, reason: "claimed" });
    expect(await balanceOf(db, "ua", "qizil")).toBe(10);
    // the streak is broken: the reward stays claimed
    await db.prepare("DELETE FROM daily WHERE user_id = 'ua'").run();
    const after = await streakState(db, "ua", NOW);
    expect(after.streak).toBe(0);
    expect(after.milestones.find((m) => m.days === 3)).toMatchObject({ claimed: true, reached: true });
  });

  it("a claim is refused before the milestone is reached, and an unknown milestone is refused", async () => {
    expect(await claimStreak(db, "ua", 3, NOW)).toEqual({ ok: false, reason: "not_reached" });
    expect(await claimStreak(db, "ua", 5, NOW)).toEqual({ ok: false, reason: "unknown" });
  });
});

describe("season rewards", () => {
  it("the top threshold reached counts; below the first threshold there is no reward", () => {
    expect(seasonRewardFor(1400)).toBeNull();
    expect(seasonRewardFor(1600)?.qizil).toBe(50);
    expect(seasonRewardFor(2600)).toMatchObject({ qizil: 200, item: "ti_champion" });
  });

  it("the season change pays the reward once, with the title for the top thresholds", async () => {
    await db.prepare("INSERT INTO ratings (user_id, rating, peak, updated_at) VALUES ('ua', 2600, 2600, ?)").bind(NOW).run();
    await db.prepare("INSERT INTO season_state (user_id, season_id) VALUES ('ua', 'S1')").run();
    const later = Date.parse("2027-01-15T12:00:00Z");
    await applySeasonCorrection(db, "ua", later);
    expect(await balanceOf(db, "ua", "qizil")).toBe(200);
    const item = await db.prepare("SELECT item_id FROM inventory WHERE user_id = 'ua'").first<{ item_id: string }>();
    expect(item?.item_id).toBe("ti_champion");
    await applySeasonCorrection(db, "ua", later + 1000);
    expect(await balanceOf(db, "ua", "qizil")).toBe(200);
  });
});

describe("skills", () => {
  it("a category with too few played experiments says so instead of inventing a score", async () => {
    const skills = await skillsFor(db, "ua");
    expect(skills).toHaveLength(5);
    expect(skills.every((s) => s.score === null && s.enough === false)).toBe(true);
    expect(SKILL_MIN_EXPERIMENTS).toBeGreaterThan(1);
  });
});

describe("daily test board", () => {
  it("ranks today's runs of the same experiment, shares ties, and lists the player's place", async () => {
    const meta = bySlug(dailySlug(TODAY))!;
    const runs: [string, number][] = [["ua", 80], ["ub", 95], ["uc", 80]];
    let n = 0;
    for (const [uid, score] of runs) {
      const id = `r${n++}`;
      await db.prepare("INSERT INTO runs (id, user_id, experiment_id, seed, status, primary_score, valid, created_at, finished_at) VALUES (?, ?, ?, 1, 'finished', ?, 1, ?, ?)")
        .bind(id, uid, meta.id, score, NOW, NOW).run();
      await db.prepare("INSERT INTO daily (user_id, date, run_id) VALUES (?, ?, ?)").bind(uid, TODAY, id).run();
    }
    const board = await dailyBoard(db, "ua", "world", NOW);
    expect(board).not.toBeNull();
    const dir = meta.direction;
    const best = dir === "higher" ? 95 : 80;
    expect(board!.rows[0].value).toBe(best);
    const mine = board!.me!;
    expect(mine.value).toBe(80);
    expect(typeof mine.rank).toBe("number");
    expect(board!.players).toBe(3);
  });
});

describe("university teams", () => {
  it("a listed university is accepted and verified; a name that is not on the list is refused", async () => {
    const listed = UNIVERSITIES[0].name;
    const ok = await createTeam(db, "ua", listed, "university", NOW);
    expect(ok.ok).toBe(true);
    const row = await db.prepare("SELECT verified FROM teams WHERE code = ?").bind(ok.ok ? ok.code : "").first<{ verified: number }>();
    expect(row?.verified).toBe(1);
    expect(await createTeam(db, "ub", "Heç bir universitet", "university", NOW)).toEqual({ ok: false, reason: "not_verified" });
  });

  it("a verified university with enough members is ranked", async () => {
    const t = await createTeam(db, "ua", UNIVERSITIES[1].name, "university", NOW);
    if (!t.ok) throw new Error("setup");
    await joinTeam(db, "ub", t.code, NOW);
    await joinTeam(db, "uc", t.code, NOW);
    const ranking = await teamRanking(db, 1, 20);
    expect(ranking.some((x) => x.id === t.id && x.verified)).toBe(true);
  });
});

describe("friend extras", () => {
  it("a team invitation is only for a friend; accepting joins the team", async () => {
    await addFriend(db, "ub", await myCode(db, "ua", NOW), NOW);
    const t = await createTeam(db, "ua", "Sinif 9A", "class", NOW);
    if (!t.ok) throw new Error("setup");
    expect(await inviteToTeam(db, "uc", "ub", t.id, NOW)).toEqual({ ok: false, reason: "not_member" });
    const inv = await inviteToTeam(db, "ua", "ub", t.id, NOW);
    expect(inv.ok).toBe(true);
    const listed = await myTeamInvites(db, "ub");
    expect(listed).toHaveLength(1);
    if (!inv.ok) return;
    expect(await respondInvite(db, "ub", inv.id, true, NOW)).toMatchObject({ ok: true, teamId: t.id });
    const member = await db.prepare("SELECT 1 AS x FROM team_members WHERE team_id = ? AND user_id = 'ub'").bind(t.id).first();
    expect(member).toBeTruthy();
  });

  it("reactions come from a fixed list and only between friends; they show as notifications", async () => {
    expect(await react(db, "ua", "ub", "gg", NOW)).toEqual({ ok: false, reason: "not_friend" });
    await addFriend(db, "ub", await myCode(db, "ua", NOW), NOW);
    expect(await react(db, "ua", "ub", "I hate you", NOW)).toEqual({ ok: false, reason: "bad_reaction" });
    expect(await react(db, "ua", "ub", "gg", NOW)).toEqual({ ok: true });
    const got = await reactionsReceived(db, "ub", 0);
    expect(got[0]).toMatchObject({ reaction: "gg", from: "Əli" });
    const n = await notificationsFor(db, "ub", 0, NOW);
    expect(n.reactions).toHaveLength(1);
  });
});

describe("equipped items and the daily reward", () => {
  it("the VS card shows the equipped avatar, and nothing when none is equipped", async () => {
    const { playerCard } = await import("../worker/match-rooms");
    expect((await playerCard(db, "ua")).avatar).toBeNull();
    await db.prepare("INSERT INTO inventory (user_id, item_id, acquired_at) VALUES ('ua', 'av_star', ?)").bind(NOW).run();
    await db.prepare("INSERT INTO equipped (user_id, slot, item_id) VALUES ('ua', 'avatar', 'av_star')").run();
    expect((await playerCard(db, "ua")).avatar).toBe("av-star");
  });

  it("the daily reward is granted once, and only after today's test is done", async () => {
    const env = { DB: db, SESSION_SECRET: "test-secret", SITE_ORIGIN: "", ADMIN_TOKEN: "x" } as never;
    const sess = (await (await app.request("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }, env)).json()) as { token: string; user: { id: string } };
    const reward = () => app.request("/api/daily/reward", { method: "POST", headers: { authorization: `Bearer ${sess.token}` } }, env);
    expect(await (await reward()).json()).toMatchObject({ granted: false, reason: "not_done" });
    const run = "dr-" + sess.user.id;
    await db.prepare("INSERT INTO runs (id, user_id, experiment_id, seed, status, primary_score, valid, created_at, finished_at) VALUES (?, ?, 1, 1, 'finished', 1, 1, ?, ?)")
      .bind(run, sess.user.id, NOW, NOW).run();
    await db.prepare("INSERT INTO daily (user_id, date, run_id) VALUES (?, ?, ?)").bind(sess.user.id, todayBaku(Date.now()), run).run();
    expect(await (await reward()).json()).toMatchObject({ granted: true, xp: 15, qizil: 5 });
    expect(await (await reward()).json()).toMatchObject({ granted: false });
  });
});

describe("weekly team competition", () => {
  it("a team is ranked by its counted members' win rates in the week; players with too few matches do not count", async () => {
    const { teamWeek } = await import("../worker/team-week");
    const { weekStart: ws } = await import("../worker/calendar");
    const start = ws(NOW);
    await user("ue", "Rəqib");
    const t = await createTeam(db, "ua", "Sinif 9B", "class", NOW);
    if (!t.ok) throw new Error("setup");
    await joinTeam(db, "ub", t.code, NOW);
    await joinTeam(db, "uc", t.code, NOW);
    for (const u of ["ua", "ub", "uc"]) for (let k = 0; k < 3; k++) {
      await db.prepare("INSERT INTO matches (id, mode, rated, winner, reason, user0, user1, created_at) VALUES (?, 'friendly', 0, ?, 'finished', ?, 'ue', ?)")
        .bind(`w-${u}-${k}`, u === "ua" ? 0 : 1, u, start + 3600_000 + k).run();
    }
    const rows = await teamWeek(db, start);
    expect(rows.find((r) => r.id === t.id)).toMatchObject({ counted: 3 });
    expect(rows.find((r) => r.id === t.id)!.score).toBeGreaterThan(0);
  });
});

describe("the discipline of the week", () => {
  it("the discipline is one of the five stages and changes from week to week; an empty week shows no score", async () => {
    const { disciplineFor, disciplineBattle, DISCIPLINES } = await import("../worker/cities");
    const d1 = disciplineFor(NOW);
    expect(DISCIPLINES).toContain(d1);
    expect(disciplineFor(NOW + 7 * 86400000)).not.toBe(d1);
    const b = await disciplineBattle(db, NOW);
    expect(b.discipline).toBe(d1);
    expect(b.cities.every((c) => c.enough === false && c.score === null)).toBe(true);
  });
});
