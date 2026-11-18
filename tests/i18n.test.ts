import { describe, expect, it } from "vitest";
import { az } from "../src/i18n/az";
import { ru } from "../src/i18n/ru";
import { adm } from "../src/i18n/admin.ru";

/** Flattens a dictionary to "a.b.c" -> string (arrays get index keys). */
function flat(o: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (typeof o === "string") out[prefix] = o;
  else if (Array.isArray(o)) o.forEach((v, i) => flat(v, `${prefix}.${i}`, out));
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) flat(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

describe("languages", () => {
  const a = flat(az), r = flat(ru);
  it("Russian has exactly the keys of Azerbaijani", () => {
    expect(Object.keys(r).sort()).toEqual(Object.keys(a).sort());
  });
  it("placeholders like {n} match in both languages, key by key", () => {
    for (const k of Object.keys(a)) expect(placeholders(r[k]), k).toBe(placeholders(a[k]));
  });
  it("no text is left empty in Russian unless it is empty in Azerbaijani", () => {
    for (const k of Object.keys(a)) if (a[k] !== "") expect(r[k].trim(), k).not.toBe("");
  });
  it("Russian texts are really Russian (Cyrillic) where the Azerbaijani ones are words", () => {
    for (const k of ["home.title", "home.start", "nav.ranking", "result.callFriend", "profile.save", "duel.rematch"]) expect(r[k], k).toMatch(/[а-яё]/i);
  });
  it("admin dictionary has no empty strings", () => {
    for (const [k, v] of Object.entries(flat(adm))) expect(v.trim(), k).not.toBe("");
  });
});
