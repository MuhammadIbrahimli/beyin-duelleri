import { NAME_BLOCKLIST } from "../config/blocklist";

export type Checked<T> = { ok: true; value: T } | { ok: false; reason: string };

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
  if (NAME_BLOCKLIST.some((w) => flat.includes(w))) return { ok: false, reason: "blocked" };
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
