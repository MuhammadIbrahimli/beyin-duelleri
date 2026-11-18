import { describe, expect, it } from "vitest";
import { SIZES, duelCard, fileName, groupCard, resultCard, wrapLines } from "../src/card/model";

const base = { slug: "refleks", brand: "Beyin duelləri", footer: ["host.az", "Bu test diaqnoz deyil."] };

describe("card model", () => {
  it("has the two required sizes", () => {
    expect(SIZES.story).toEqual({ w: 1080, h: 1920 });
    expect(SIZES.post).toEqual({ w: 1080, h: 1080 });
  });
  it("result card: nickname, experiment, level, number, comparison; accent follows the experiment", () => {
    const m = resultCard({ ...base, nickname: "Sürətli Qartal", experiment: "Refleks", level: "Səviyyə 4 · Şimşək", score: "247 ms", compare: "Sən ilk qatılanlardansın" });
    expect(m.accent).toBe("--c-exp-refleks");
    const texts = m.items.map((i) => (i.type === "text" ? i.text : ""));
    expect(texts).toEqual(["Sürətli Qartal", "Refleks", "Səviyyə 4 · Şimşək", "247 ms", "Sən ilk qatılanlardansın"]);
    expect(m.footer).toContain("Bu test diaqnoz deyil.");
  });
  it("no level line for experiments without levels", () => {
    const m = resultCard({ ...base, slug: "lovber", nickname: "A B", experiment: "Lövbər", level: null, score: "475 m", compare: "x" });
    expect(m.items.some((i) => i.type === "text" && i.text.startsWith("Səviyyə"))).toBe(false);
  });
  it("duel card keeps both results and marks the winner", () => {
    const m = duelCard({ ...base, experiment: "Refleks", title: "Qalib: Sən!", left: { label: "Sən", value: "240 ms", win: true }, right: { label: "Qartal", value: "300 ms", win: false } });
    const pair = m.items.find((i) => i.type === "pair") as Extract<(typeof m.items)[number], { type: "pair" }>;
    expect([pair.left.win, pair.right.win]).toEqual([true, false]);
  });
  it("group card shows only the top three", () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ rank: i + 1, name: `n${i}`, value: `${200 + i}`, me: i === 4 }));
    const m = groupCard({ ...base, experiment: "Refleks", title: "Qrup reytinqi", rows });
    const r = m.items.find((i) => i.type === "rank") as Extract<(typeof m.items)[number], { type: "rank" }>;
    expect(r.rows.map((x) => x.rank)).toEqual([1, 2, 3]);
  });
  it("file names are stable and format-specific", () => {
    expect(fileName("result", "refleks", "story")).toBe("beyin-result-refleks-story.png");
    expect(fileName("duel", "lovber", "post")).toBe("beyin-duel-lovber-post.png");
  });
});

describe("wrapLines", () => {
  const measure = (s: string) => s.length * 10;
  it("wraps greedily at the width", () => {
    expect(wrapLines(measure, "aaa bbb ccc ddd", 75)).toEqual(["aaa bbb", "ccc ddd"]);
  });
  it("keeps an over-long word on its own line and ignores extra spaces", () => {
    expect(wrapLines(measure, "  a   verylongword b ", 50)).toEqual(["a", "verylongword", "b"]);
    expect(wrapLines(measure, "", 50)).toEqual([]);
  });
});
