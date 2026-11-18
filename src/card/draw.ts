import { SIZES, wrapLines, type CardModel, type Format, type Item } from "./model";

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const PAD = 90;
const EXTRA_CHARS = "əıöşğçüƏİÖŞĞÇÜ";

async function loadFonts(texts: string[]) {
  const sample = texts.join(" ") + EXTRA_CHARS;
  const family = css("--font");
  await Promise.all([500, 600, 700, 800].map((w) => document.fonts.load(`${w} 64px ${family}`, sample)));
  await document.fonts.ready;
}

/** #rrggbb + alpha -> rgba() string (tokens are hex). */
function rgba(hex: string, a: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

interface Palette { bg: string; surface: string; text: string; muted: string; accent: string; good: string; primary: string; font: string }

/** Draws (or, with dry = true, only measures) one item; returns the height it takes. */
function drawItem(ctx: CanvasRenderingContext2D, it: Item, y: number, w: number, p: Palette, dry: boolean): number {
  const inner = w - 2 * PAD;
  if (it.type === "text") {
    // big numbers shrink to fit on one line instead of wrapping
    let size = it.size;
    ctx.font = `${it.weight} ${size}px ${p.font}`;
    if (size >= 150) while (size > 120 && ctx.measureText(it.text).width > inner) { size -= 10; ctx.font = `${it.weight} ${size}px ${p.font}`; }
    const lines = wrapLines((s) => ctx.measureText(s).width, it.text, inner);
    const lh = size * 1.15;
    if (!dry) {
      ctx.fillStyle = p[it.color];
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      lines.forEach((l, i) => ctx.fillText(l, w / 2, y + i * lh));
    }
    return lines.length * lh + it.after;
  }
  if (it.type === "pair") {
    const gap = 40, pw = (inner - gap) / 2, ph = 380;
    if (!dry) {
      [it.left, it.right].forEach((s, i) => {
        const x = PAD + i * (pw + gap);
        roundRect(ctx, x, y, pw, ph, 44);
        ctx.fillStyle = p.surface;
        ctx.fill();
        if (s.win) { ctx.lineWidth = 12; ctx.strokeStyle = p.good; ctx.stroke(); }
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = p.muted;
        ctx.font = `700 48px ${p.font}`;
        ctx.fillText(s.label, x + pw / 2, y + 50, pw - 40);
        ctx.fillStyle = p.accent;
        ctx.font = `800 96px ${p.font}`;
        ctx.fillText(s.value, x + pw / 2, y + 170, pw - 40);
      });
    }
    return ph;
  }
  const rh = 150, gap = 28;
  if (!dry) {
    it.rows.forEach((r, i) => {
      const ry = y + i * (rh + gap);
      roundRect(ctx, PAD, ry, inner, rh, 40);
      ctx.fillStyle = p.surface;
      ctx.fill();
      if (r.me) { ctx.lineWidth = 8; ctx.strokeStyle = p.primary; ctx.stroke(); }
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillStyle = p.accent;
      ctx.font = `800 76px ${p.font}`;
      ctx.fillText(`${r.rank}.`, PAD + 40, ry + rh / 2);
      ctx.fillStyle = p.text;
      ctx.font = `700 56px ${p.font}`;
      ctx.fillText(r.name, PAD + 150, ry + rh / 2, inner - 450);
      ctx.textAlign = "right";
      ctx.font = `800 60px ${p.font}`;
      ctx.fillText(r.value, PAD + inner - 40, ry + rh / 2);
    });
  }
  return it.rows.length * (rh + gap);
}

export async function renderCard(m: CardModel, format: Format): Promise<Blob> {
  const { w, h } = SIZES[format];
  const texts = [m.brand, ...m.footer, ...m.items.flatMap((i) => (i.type === "text" ? [i.text] : i.type === "pair" ? [i.left.label, i.left.value, i.right.label, i.right.value] : i.rows.flatMap((r) => [r.name, r.value])))];
  await loadFonts(texts);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const p: Palette = {
    bg: css("--c-bg"), surface: css("--c-surface"), text: css("--c-text"), muted: css("--c-muted"),
    accent: css(m.accent), good: css("--c-good"), primary: css("--c-primary"), font: css("--font"),
  };

  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, w, h);
  // two soft accent glows (radial gradients, no photos)
  const glow = (cx: number, cy: number, r: number, a: number) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, rgba(p.accent, a));
    g.addColorStop(1, rgba(p.accent, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };
  glow(w * 0.5, h * 0.04, w * 0.95, 0.32);
  glow(w * 0.1, h * 0.98, w * 0.7, 0.16);

  // header: brand mark (two overlapping discs) + name
  const mx = w / 2, my = 120, mr = 26;
  const disc = (cx: number, color: string) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, my, mr, 0, Math.PI * 2); ctx.fill(); };
  disc(mx - 16, p.primary);
  disc(mx + 16, p.good);
  ctx.save();
  ctx.beginPath(); ctx.arc(mx - 16, my, mr, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = p.bg; ctx.beginPath(); ctx.arc(mx + 16, my, mr, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.fillStyle = p.muted;
  ctx.font = `800 44px ${p.font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(m.brand, w / 2, 168);

  // footer, stacked from the bottom
  const fSizes = m.footer.map((_, i) => (i === 0 ? 56 : 36));
  const footerH = fSizes.reduce((a, s) => a + s * 1.4, 0);
  let fy = h - 100 - footerH;
  m.footer.forEach((line, i) => {
    ctx.font = `${i === 0 ? 800 : 600} ${fSizes[i]}px ${p.font}`;
    ctx.fillStyle = i === 0 ? p.accent : p.muted;
    ctx.fillText(line, w / 2, fy);
    fy += fSizes[i] * 1.4;
  });

  // content: vertically centred between header and footer, scaled down if it does not fit
  const top = 270, bottom = h - 100 - footerH - 50;
  const total = m.items.reduce((a, it) => a + drawItem(ctx, it, 0, w, p, true), 0);
  const scale = Math.min(1, (bottom - top) / total);
  const startY = top + Math.max(0, (bottom - top - total * scale) / 2);
  ctx.save();
  ctx.translate(w / 2, startY);
  ctx.scale(scale, scale);
  ctx.translate(-w / 2, 0);
  let y = 0;
  for (const it of m.items) y += drawItem(ctx, it, y, w, p, false);
  ctx.restore();

  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"));
}
