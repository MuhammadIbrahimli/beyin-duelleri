// Pure card layout model: no DOM, no canvas, fully testable. Text arrives already localised.
export type Format = "story" | "post";
export const SIZES: Record<Format, { w: number; h: number }> = {
  story: { w: 1080, h: 1920 },
  post: { w: 1080, h: 1080 },
};

export type Color = "text" | "muted" | "accent";
export interface Side { label: string; value: string; win: boolean }
export interface RankRow { rank: number; name: string; value: string; me: boolean }
export type Item =
  | { type: "text"; text: string; size: number; weight: number; color: Color; after: number }
  | { type: "pair"; left: Side; right: Side }
  | { type: "rank"; rows: RankRow[] };

export interface CardModel {
  slug: string;
  accent: string;   // name of the design token, e.g. "--c-exp-refleks"
  brand: string;
  items: Item[];
  footer: string[];
}

const text = (t: string, size: number, weight: number, color: Color, after = 24): Item => ({ type: "text", text: t, size, weight, color, after });
const accentOf = (slug: string) => `--c-exp-${slug}`;

export interface ResultInput {
  slug: string; brand: string; nickname: string; experiment: string;
  level: string | null; score: string; compare: string; extra?: string[]; footer: string[];
}
export function resultCard(i: ResultInput): CardModel {
  return {
    slug: i.slug, accent: accentOf(i.slug), brand: i.brand, footer: i.footer,
    items: [
      text(i.nickname, 56, 700, "muted", 12),
      text(i.experiment, 84, 800, "accent", 28),
      ...(i.level ? [text(i.level, 64, 800, "text", 20)] : []),
      text(i.score, 260, 800, "accent", 28),
      text(i.compare, 52, 600, "text", 16),
      ...(i.extra ?? []).map((e) => text(e, 44, 600, "muted", 12)),
    ],
  };
}

export interface DuelInput {
  slug: string; brand: string; experiment: string; title: string; left: Side; right: Side; footer: string[];
}
export function duelCard(i: DuelInput): CardModel {
  return {
    slug: i.slug, accent: accentOf(i.slug), brand: i.brand, footer: i.footer,
    items: [text(i.experiment, 72, 800, "accent", 24), text(i.title, 96, 800, "text", 56), { type: "pair", left: i.left, right: i.right }],
  };
}

export interface GroupInput {
  slug: string; brand: string; experiment: string; title: string; rows: RankRow[]; footer: string[];
}
/** Podium card: only the top three are shown. */
export function groupCard(i: GroupInput): CardModel {
  return {
    slug: i.slug, accent: accentOf(i.slug), brand: i.brand, footer: i.footer,
    items: [text(i.experiment, 72, 800, "accent", 24), text(i.title, 96, 800, "text", 48), { type: "rank", rows: i.rows.slice(0, 3) }],
  };
}

export interface BadgeInput { brand: string; nickname: string; name: string; desc: string; footer: string[] }
export function badgeCard(i: BadgeInput): CardModel {
  return {
    slug: "badge", accent: "--c-primary", brand: i.brand, footer: i.footer,
    items: [text(i.nickname, 56, 700, "muted", 40), text(i.name, 120, 800, "accent", 40), text(i.desc, 56, 600, "text", 16)],
  };
}

export interface ScoreInput { brand: string; nickname: string; title: string; score: string; sub: string; footer: string[] }
export function scoreCard(i: ScoreInput): CardModel {
  return {
    slug: "badge", accent: "--c-primary", brand: i.brand, footer: i.footer,
    items: [text(i.nickname, 56, 700, "muted", 12), text(i.title, 80, 800, "accent", 24), text(i.score, 300, 800, "text", 28), text(i.sub, 52, 600, "muted", 12)],
  };
}

export interface RecapInput { brand: string; nickname: string; title: string; score: string; lines: string[]; footer: string[] }
/** Weekly / monthly recap: the current Beyin balı plus a few plain facts about the period. */
export function recapCard(i: RecapInput): CardModel {
  return {
    slug: "badge", accent: "--c-primary", brand: i.brand, footer: i.footer,
    items: [text(i.nickname, 56, 700, "muted", 12), text(i.title, 80, 800, "accent", 24), text(i.score, 300, 800, "text", 28), ...i.lines.map((l) => text(l, 52, 600, "muted", 14))],
  };
}

export const fileName = (kind: string, slug: string, format: Format) => `beyin-${kind}-${slug}-${format}.png`;

/** Greedy word wrap with an injected measuring function (canvas measureText in the browser). */
export function wrapLines(measure: (s: string) => number, input: string, maxWidth: number): string[] {
  const words = input.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && measure(next) > maxWidth) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}
