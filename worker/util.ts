import { ADJECTIVES, ANIMALS } from "../config/nicknames.az";

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

export const signToken = async (secret: string, userId: string) => `${userId}.${await hmac(secret, "t:" + userId)}`;

export async function verifyToken(secret: string, token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i < 1) return null;
  const id = token.slice(0, i);
  const expected = await hmac(secret, "t:" + id);
  const given = token.slice(i + 1);
  if (given.length !== expected.length) return null;
  let diff = 0;
  for (let k = 0; k < given.length; k++) diff |= given.charCodeAt(k) ^ expected.charCodeAt(k);
  return diff === 0 ? id : null;
}

/** IP is only ever used as a hash with a salt that rotates daily; it is never stored. */
export async function hashIp(secret: string, ip: string, day: string): Promise<string> {
  return hmac(secret, `ip:${day}:${ip}`);
}

export function randomNickname(): string {
  const pick = <T,>(a: readonly T[]) => a[crypto.getRandomValues(new Uint32Array(1))[0] % a.length];
  return `${pick(ADJECTIVES)} ${pick(ANIMALS)}`;
}

export type DeviceClass = "ios" | "android" | "desktop" | "other";
export function deviceClassFromUA(ua: string | null | undefined): DeviceClass {
  if (!ua) return "other";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Windows|Macintosh|Linux|X11|CrOS/i.test(ua)) return "desktop";
  return "other";
}

const CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
export function newDuelCode(len = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}
export const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
