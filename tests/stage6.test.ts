import { beforeEach, describe, expect, it } from "vitest";
import { makeD1 } from "./d1shim";
import { weekStart } from "../worker/calendar";
import { createTeam, joinTeam } from "../worker/teams";
import { createChallenge, respondChallenge, scoreOf, myChallenges } from "../worker/team-challenges";
import { addFriend, listFriends, myCode } from "../worker/social";
import { EVENTS } from "../config/seasons";
import { eventBoard } from "../worker/events-board";

const NOW = Date.parse("2026-12-15T08:00:00Z");
let db: D1Database;

async function user(id: string, nick = id, seen = NOW, show = 1) {
  await db.prepare("INSERT INTO users (id, nickname, created_at, last_seen_at, show_presence) VALUES (?, ?, ?, ?, ?)").bind(id, nick, NOW, seen, show).run();
}

beforeEach(async () => {
  db = makeD1();
  await user("ua", "Əli");
  await user("ub", "Leyla");
  await user("uc", "Nigar");
  await user("ud", "Kənan");
});

async function twoTeams() {
  const a = await createTeam(db, "ua", "Sinif A", "class", NOW);
  const b = await createTeam(db, "ub", "Sinif B", "class", NOW);
  if (!a.ok || !b.ok) throw new Error("setup");
  await joinTeam(db, "uc", a.code, NOW);
  await joinTeam(db, "ud", b.code, NOW);
  return { a, b };
}

describe("team challenges", () => {
  it("only the owner of the inviting team sends it; only the owner of the other team accepts", async () => {
    const { a, b } = await twoTeams();
    expect(await createChallenge(db, "ub", a.id, b.code, NOW)).toEqual({ ok: false, reason: "not_owner" });
    expect(await createChallenge(db, "ua", a.id, a.code, NOW)).toEqual({ ok: false, reason: "same_team" });
    const c = await createChallenge(db, "ua", a.id, b.code, NOW);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(await respondChallenge(db, "ua", c.id, true, NOW)).toEqual({ ok: false, reason: "not_owner" });
    expect(await respondChallenge(db, "ub", c.id, true, NOW)).toEqual({ ok: true });
  });

  it("the score counts real matches between members of the two teams in the challenge week; draws count for nobody", async () => {
    const { a, b } = await twoTeams();
    const c = await createChallenge(db, "ua", a.id, b.code, NOW);
    if (!c.ok) throw new Error("setup");
    await respondChallenge(db, "ub", c.id, true, NOW);
    const start = weekStart(NOW);
    await db.prepare("INSERT INTO matches (id, mode, rated, winner, reason, user0, user1, created_at) VALUES ('t1', 'friendly', 0, 0, 'finished', 'ua', 'ub', ?)").bind(start + 3600e3).run();
    await db.prepare("INSERT INTO matches (id, mode, rated, winner, reason, user0, user1, created_at) VALUES ('t2', 'friendly', 0, 1, 'finished', 'ud', 'uc', ?)").bind(start + 7200e3).run();
    await db.prepare("INSERT INTO matches (id, mode, rated, winner, reason, user0, user1, created_at) VALUES ('t3', 'friendly', 0, -1, 'finished', 'ua', 'ud', ?)").bind(start + 9000e3).run();
    // a match inside one team does not count
    await db.prepare("INSERT INTO matches (id, mode, rated, winner, reason, user0, user1, created_at) VALUES ('t4', 'friendly', 0, 0, 'finished', 'ua', 'uc', ?)").bind(start + 9500e3).run();
    const s = await scoreOf(db, c.id, NOW);
    expect(s).toMatchObject({ matches: 3, from: { wins: 2 }, to: { wins: 0 }, leader: a.id, status: "accepted" });
  });

  it("an open challenge has no score yet; a declined one stays closed", async () => {
    const { a, b } = await twoTeams();
    const c = await createChallenge(db, "ua", a.id, b.code, NOW);
    if (!c.ok) throw new Error("setup");
    expect((await scoreOf(db, c.id, NOW))?.matches).toBe(0);
    await respondChallenge(db, "ub", c.id, false, NOW);
    expect((await myChallenges(db, "uc", NOW)).find((x) => x?.id === c.id)?.status).toBe("declined");
  });

  it("a challenge cannot be accepted after its week is over", async () => {
    const { a, b } = await twoTeams();
    const c = await createChallenge(db, "ua", a.id, b.code, NOW);
    if (!c.ok) throw new Error("setup");
    expect(await respondChallenge(db, "ub", c.id, true, NOW + 8 * 86400e3)).toEqual({ ok: false, reason: "week_over" });
  });
});

describe("presence", () => {
  it("a friend is online only if they allow it and were seen in the last five minutes", async () => {
    await user("ue", "Aynur", NOW - 60e3, 1);
    await user("uf", "Rauf", NOW - 60e3, 0);
    await user("ug", "Sevil", NOW - 3600e3, 1);
    for (const f of ["ue", "uf", "ug"]) {
      await addFriend(db, "ua", await myCode(db, f, NOW), NOW);
    }
    const friends = await listFriends(db, "ua", NOW);
    const byId = Object.fromEntries(friends.map((f) => [f.id, f.online]));
    expect(byId.ue).toBe(true);
    expect(byId.uf).toBe(false);
    expect(byId.ug).toBe(false);
  });
});

describe("event board", () => {
  it("an enabled event ranks players by wins in its days; a disabled event has no board", async () => {
    expect(await eventBoard(db, "refleks_turniri")).toBeNull();
    const ev = { id: "test_event", title: { az: "t", ru: "t" }, description: { az: "d", ru: "d" }, from: "2026-12-14", to: "2026-12-15", xpMultiplier: 2, enabled: true };
    EVENTS.push(ev);
    const inside = Date.parse("2026-12-14T12:00:00Z");
    await db.prepare("INSERT INTO matches (id, mode, rated, winner, reason, user0, user1, created_at) VALUES ('e1', 'friendly', 0, 0, 'finished', 'ua', 'ub', ?)").bind(inside).run();
    await db.prepare("INSERT INTO matches (id, mode, rated, winner, reason, user0, user1, created_at) VALUES ('e2', 'friendly', 0, 1, 'finished', 'ua', 'uc', ?)").bind(inside + 1000).run();
    // the day after the event does not count
    await db.prepare("INSERT INTO matches (id, mode, rated, winner, reason, user0, user1, created_at) VALUES ('e3', 'friendly', 0, 0, 'finished', 'ua', 'ud', ?)").bind(Date.parse("2026-12-17T12:00:00Z")).run();
    const b = await eventBoard(db, "test_event");
    expect(b?.rows.find((r) => r.nick === "Əli")).toMatchObject({ wins: 1, played: 2 });
    EVENTS.splice(EVENTS.indexOf(ev), 1);
  });
});
