import { az as azDict, type Dict } from "./az";
import { ru } from "./ru";

export type Lang = "az" | "ru";
const dicts: Record<Lang, Dict> = { az: azDict as unknown as Dict, ru };

function initial(): Lang {
  const saved = localStorage.getItem("bd_lang");
  if (saved === "az" || saved === "ru") return saved;
  return navigator.language?.toLowerCase().startsWith("ru") ? "ru" : "az";
}
let lang: Lang = initial();
document.documentElement.lang = lang;

export const getLang = () => lang;
/** Stores the language; the caller reloads the page so every screen is rebuilt in it. */
export function setLang(l: Lang) {
  lang = l;
  localStorage.setItem("bd_lang", l);
  document.documentElement.lang = l;
}

/** Live view of the current language: `az.home.title` always returns the text in the language that is active now. */
export const az = new Proxy({} as typeof azDict, {
  get: (_t, key: string) => (dicts[lang] as unknown as Record<string, unknown>)[key],
});

/** t("result.level", { n: 3 }). Missing keys return the key itself. */
export function t(path: string, vars?: Record<string, string | number>): string {
  let cur: unknown = dicts[lang];
  for (const k of path.split(".")) cur = (cur as Record<string, unknown> | undefined)?.[k];
  if (typeof cur !== "string") return path;
  return vars ? cur.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? "")) : cur;
}
