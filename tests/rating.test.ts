import { describe, expect, it } from "vitest";
import { LEAGUES, RATING } from "../config/rating";
import { applyRated, expectedScore, kFactor, leagueOf, nextStreak, scoreForSeat0 } from "../worker/rating-core";

const fresh = (rating = RATING.start, played = RATING.calibrationMatches) => ({ rating, played, streak: 0 });

describe("Elo", () => {
  it("equal ratings expect half a point", () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5);
  });

  it("a 400 point stronger opponent is expected to win about 9 times in 10", () => {
    expect(expectedScore(1000, 1400)).toBeCloseTo(1 / 11, 5);
  });

  it("a win between equals moves each side by K/2 (regular K)", () => {
    const r = applyRated(fresh(1000), fresh(1000), 1, 0);
    expect(r.deltaA).toBe(12);
    expect(r.deltaB).toBe(-12);
    expect(r.a.rating + r.b.rating).toBe(2000); // zero-sum between two accounts
  });

  it("a draw between equals changes nothing", () => {
    const r = applyRated(fresh(1000), fresh(1000), 0.5, 0);
    expect(r.deltaA).toBe(0);
    expect(r.deltaB).toBe(0);
  });

  it("the first matches use the calibration K, which moves the rating faster", () => {
    expect(kFactor(0)).toBe(RATING.kCalibration);
    expect(kFactor(RATING.calibrationMatches)).toBe(RATING.kRegular);
    const r = applyRated(fresh(1000, 0), fresh(1000, 0), 1, 0);
    expect(r.deltaA).toBe(24);
  });

  it("beating a stronger player gains more than beating a weaker one", () => {
    const up = applyRated(fresh(900), fresh(1200), 1, 0);
    const down = applyRated(fresh(900), fresh(600), 1, 0);
    expect(up.deltaA).toBeGreaterThan(down.deltaA);
  });

  it("the rating never goes below the floor", () => {
    const r = applyRated(fresh(5, 0), fresh(0, 0), 0, 0);
    expect(r.a.rating).toBe(RATING.floor);
  });

  it("the repeat rule: from the repeat limit on, a rematch between the same two changes no rating", () => {
    const r = applyRated(fresh(1000), fresh(1000), 1, RATING.repeatLimit);
    expect(r.farmed).toBe(true);
    expect(r.deltaA).toBe(0);
    expect(r.deltaB).toBe(0);
    expect(applyRated(fresh(1000), fresh(1000), 1, RATING.repeatLimit - 1).farmed).toBe(false);
  });

  it("the played counter goes up for both sides; the streak follows the result", () => {
    const r = applyRated(fresh(1000, 2), fresh(1000, 2), 1, 0);
    expect(r.a.played).toBe(3);
    expect(r.a.streak).toBe(1);
    expect(r.b.streak).toBe(-1);
  });

  it("the streak: wins add up, a loss breaks a win streak, a draw resets it", () => {
    expect(nextStreak(0, 1)).toBe(1);
    expect(nextStreak(2, 1)).toBe(3);
    expect(nextStreak(3, 0)).toBe(-1);
    expect(nextStreak(-2, 0)).toBe(-3);
    expect(nextStreak(4, 0.5)).toBe(0);
  });

  it("winner -1 is a draw for seat 0", () => {
    expect(scoreForSeat0(0)).toBe(1);
    expect(scoreForSeat0(1)).toBe(0);
    expect(scoreForSeat0(-1)).toBe(0.5);
  });
});

describe("leagues", () => {
  it("each league starts at its own threshold, and the one below ends just before it", () => {
    for (const [i, l] of LEAGUES.entries()) {
      expect(leagueOf(l.min)).toBe(l.id);
      if (i > 0) expect(leagueOf(l.min - 1)).toBe(LEAGUES[i - 1].id);
    }
  });

  it("the spec thresholds: Bürünc 0-499, Gümüş 500-999, Qızıl 1000-1499, Platin 1500-1999, Almaz 2000-2499, Ustad 2500-2999, Əfsanə 3000+", () => {
    expect(leagueOf(0)).toBe("burunc");
    expect(leagueOf(499)).toBe("burunc");
    expect(leagueOf(500)).toBe("gumus");
    expect(leagueOf(1499)).toBe("qizil");
    expect(leagueOf(1500)).toBe("platin");
    expect(leagueOf(2999)).toBe("ustad");
    expect(leagueOf(3000)).toBe("efsane");
  });

  it("a new player starts in the first league", () => {
    expect(leagueOf(RATING.start)).toBe("burunc");
  });
});
