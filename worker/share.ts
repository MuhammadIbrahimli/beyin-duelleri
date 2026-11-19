import { byId } from "../shared/experiments";
import { pointsFor } from "../shared/points";
import type { Env } from "./env";

/** Share previews: the invite links for a duel or a group get their own title and description, so the chat card shows who is calling and why. */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface Preview { title: string; description: string }

export async function previewFor(env: Env, kind: "d" | "g", code: string): Promise<Preview | null> {
  if (kind === "d") {
    const row = await env.DB.prepare(
      `SELECT d.experiment_id AS exp, r.primary_score AS raw, u.nickname AS nick
       FROM duels d JOIN runs r ON r.id = d.creator_run_id JOIN users u ON u.id = r.user_id WHERE d.code = ?`,
    ).bind(code).first<{ exp: number; raw: number; nick: string }>();
    if (!row) return null;
    const slug = byId(row.exp)?.slug ?? "";
    const pts = slug ? pointsFor(slug, row.raw) : 0;
    return {
      title: `${row.nick} səni dueldə çağırır`,
      description: `Beyin balı ${pts}. Eyni tapşırıq, eyni sözlər. Sən neçə bal alacaqsan?`,
    };
  }
  const g = await env.DB.prepare(
    `SELECT g.name AS name, (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS members
     FROM groups g WHERE g.code = ?`,
  ).bind(code.toUpperCase()).first<{ name: string; members: number }>();
  if (!g) return null;
  return {
    title: `${g.name} — Beyin duelləri`,
    description: `${g.members} nəfər artıq qoşulub. Kodla qoşul və reytinqdə öz yerini tap.`,
  };
}

const FALLBACK = { title: "Beyin duelləri", description: "Beynini dostunla yoxla. 60 saniyə, qeydiyyat yoxdur." };

/** Serves the SPA shell with the preview tags filled in. Unknown codes get the generic page, never an error. */
export async function sharePage(request: Request, env: Env, kind: "d" | "g", code: string): Promise<Response> {
  const preview = (await previewFor(env, kind, code).catch(() => null)) ?? FALLBACK;
  const origin = env.SITE_ORIGIN || new URL(request.url).origin;
  let html: string;
  const shell = env.ASSETS ? await env.ASSETS.fetch(new URL("/index.html", request.url)).then((r) => r.text()).catch(() => "") : "";
  if (shell.includes("</head>")) {
    html = shell.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(preview.title)}</title>`);
  } else {
    html = `<!doctype html><html lang="az"><head><meta charset="utf-8"><title>${esc(preview.title)}</title></head><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>`;
  }
  const tags = [
    `<meta name="description" content="${esc(preview.description)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Beyin duelləri">`,
    `<meta property="og:title" content="${esc(preview.title)}">`,
    `<meta property="og:description" content="${esc(preview.description)}">`,
    `<meta property="og:url" content="${esc(`${origin}/${kind}/${code}`)}">`,
    `<meta property="og:image" content="${esc(`${origin}/icon-512.png`)}">`,
    `<meta name="twitter:card" content="summary">`,
  ].join("");
  html = html.replace("</head>", () => `${tags}</head>`);
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
