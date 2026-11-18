import { NAME_BLOCKLIST } from "../config/blocklist";

export type Checked<T> = { ok: true; value: T } | { ok: false; reason: string };

// Look-alike letters folded to one form, so "S1ktir", "сука" typed with Latin c/y/k/a and "sıktır" all collapse.
const FOLD: Record<string, string> = {
  // Cyrillic look-alikes -> Latin
  а: "a", в: "b", е: "e", ё: "e", и: "i", й: "i", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x", ь: "b",
  // Azerbaijani / Turkish letters -> plain Latin
  ə: "e", ı: "i", ö: "o", ü: "u", ş: "s", ç: "c", ğ: "g", ѕ: "s", і: "i",
  // digits and symbols used as letters
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s",
};
// Cyrillic letters without a Latin twin keep their own identity but are lower-cased and de-accented the same way.
const SPECIAL = new Set([".", "_", "-", " "]);

/** Lower-case, strip separators and fold look-alikes; used on both the name and the blocklist. */
export function nameSkeleton(v: string): string {
  let out = "";
  for (const ch of v.normalize("NFC").toLowerCase()) {
    if (SPECIAL.has(ch)) continue;
    out += FOLD[ch] ?? ch;
  }
  // collapse repeated letters ("fuuuck" -> "fuck")
  return out.replace(/(.)\1+/g, "$1");
}
const BLOCK = NAME_BLOCKLIST.map(nameSkeleton).filter((w) => w.length >= 3);
export const isBlockedName = (v: string) => { const s = nameSkeleton(v); return BLOCK.some((w) => s.includes(w)); };

/**
 * Display names are free text shown to other people, so they are kept deliberately narrow:
 * 2-20 characters, letters (any alphabet), digits, space . _ -  and nothing that looks like a link or contact.
 */
export function validateName(raw: unknown): Checked<string> {
  if (typeof raw !== "string") return { ok: false, reason: "type" };
  const v = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  if (v.length < 2 || v.length > 20) return { ok: false, reason: "length" };
  if (!/^[\p{L}\p{N} ._-]+$/u.test(v)) return { ok: false, reason: "chars" };
  const flat = v.toLowerCase().replace(/[ ._-]/g, "");
  if (/(https?|www|\.com|\.az|\.ru|t\.me|wa\.me)/i.test(v) || /^\d{7,}$/.test(flat)) return { ok: false, reason: "link" };
  if (isBlockedName(v)) return { ok: false, reason: "blocked" };
  return { ok: true, value: v };
}

/** Empty / null clears the email. */
export function validateEmail(raw: unknown): Checked<string | null> {
  if (raw === null || raw === undefined || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, reason: "type" };
  const v = raw.trim().toLowerCase();
  if (v.length > 120 || !/^[^\s@]{1,64}@[^\s@]{1,100}\.[^\s@.]{2,}$/.test(v)) return { ok: false, reason: "email" };
  return { ok: true, value: v };
}
