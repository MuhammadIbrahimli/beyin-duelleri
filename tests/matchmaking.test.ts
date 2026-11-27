import { describe, expect, it } from "vitest";
import { MATCHMAKING } from "../config/matchmaking";
import { allowedRange, botOffers, findPairs, timedOut, type Entry } from "../worker/matchmaking-core";

const e = (userId: string, rating: number, joinedAt: number): Entry => ({ userId, rating, joinedAt, offeredBot: false });
const NOW = 1_000_000;

describe("the allowed rating difference widens while a player waits", () => {
  it("starts at the base range and grows step by step", () => {
    expect(allowedRange(0)).toBe(MATCHMAKING.baseRange);
    expect(allowedRange(MATCHMAKING.widenStepMs - 1)).toBe(MATCHMAKING.baseRange);
    expect(allowedRange(MATCHMAKING.widenStepMs)).toBe(MATCHMAKING.baseRange + MATCHMAKING.widenStep);
  });

  it("is capped at the maximum", () => {
    expect(allowedRange(10_000_000)).toBe(MATCHMAKING.maxRange);
  });
});

describe("pairing", () => {
  it("two players close in rating are paired at once", () => {
    const pairs = findPairs([e("a", 1000, NOW), e("b", 1050, NOW)], NOW);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].map((p) => p.userId).sort()).toEqual(["a", "b"]);
  });

  it("players too far apart wait, and are paired once the range has widened", () => {
    const q = [e("a", 1000, NOW), e("b", 1000 + MATCHMAKING.baseRange + 150, NOW)];
    expect(findPairs(q, NOW)).toEqual([]);
    expect(findPairs(q, NOW + 10 * MATCHMAKING.widenStepMs)).toHaveLength(1);
  });

  it("a player is never in two pairs, and nobody is paired with themselves", () => {
    const q = [e("a", 1000, NOW), e("b", 1010, NOW), e("c", 1020, NOW), e("d", 1030, NOW)];
    const pairs = findPairs(q, NOW);
    const ids = pairs.flat().map((p) => p.userId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(pairs).toHaveLength(2);
  });

  it("the player who has waited longest is matched first, with the closest rating", () => {
    const q = [e("old", 1000, NOW - 9000), e("far", 1090, NOW), e("near", 1010, NOW - 100)];
    const pairs = findPairs(q, NOW);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].map((p) => p.userId).sort()).toEqual(["near", "old"]);
  });

  it("a lone player is not paired", () => {
    expect(findPairs([e("a", 1000, NOW)], NOW)).toEqual([]);
  });

  it("the same input always gives the same pairs (no randomness)", () => {
    const q = [e("a", 1000, NOW), e("b", 1010, NOW), e("c", 1005, NOW)];
    expect(findPairs(q, NOW)).toEqual(findPairs([...q].reverse(), NOW));
  });
});

describe("offers and timeouts", () => {
  it("a bot is offered once the player has waited long enough, and only once", () => {
    const q = [e("a", 1000, NOW)];
    expect(botOffers(q, NOW + MATCHMAKING.botOfferMs - 1)).toEqual([]);
    expect(botOffers(q, NOW + MATCHMAKING.botOfferMs)).toHaveLength(1);
    q[0].offeredBot = true;
    expect(botOffers(q, NOW + 10 * MATCHMAKING.botOfferMs)).toEqual([]);
  });

  it("a search ends after the timeout", () => {
    const q = [e("a", 1000, NOW), e("b", 1000, NOW + MATCHMAKING.timeoutMs)];
    expect(timedOut(q, NOW + MATCHMAKING.timeoutMs - 1).map((x) => x.userId)).toEqual([]);
    expect(timedOut(q, NOW + MATCHMAKING.timeoutMs).map((x) => x.userId)).toEqual(["a"]);
  });
});
