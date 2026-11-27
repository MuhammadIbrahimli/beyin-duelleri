// Shareable result cards: a 1080x1350 PNG drawn on a canvas (flat colours, no personal data beyond what the player
// chooses to show). Shared with the system share sheet where it exists, otherwise downloaded.
import { h } from "./dom";
import { az } from "./i18n";

export interface CardSpec {
  kicker: string;   // small line on top, e.g. "Beyin duellisi · Marafon"
  title: string;    // main line
  big: string;      // the number or result
  lines: string[];  // a few short lines
  footer?: string;
}

const W = 1080;
const H = 1350;

export function drawCard(spec: CardSpec): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0b0c11";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#ffd23f";
  g.fillRect(80, 120, 120, 10);
  const font = (weight: number, size: number) => `${weight} ${size}px "Manrope Variable", system-ui, sans-serif`;
  g.fillStyle = "#9aa1b5";
  g.font = font(600, 40);
  g.fillText(spec.kicker, 80, 200, W - 160);
  g.fillStyle = "#f4f5f9";
  g.font = font(800, 84);
  g.fillText(spec.title, 80, 320, W - 160);
  g.fillStyle = "#ffd23f";
  g.font = font(900, 260);
  g.fillText(spec.big, 80, 640, W - 160);
  g.fillStyle = "#c2c7d6";
  g.font = font(500, 46);
  spec.lines.slice(0, 6).forEach((line, i) => g.fillText(line, 80, 760 + i * 74, W - 160));
  g.fillStyle = "#6b7288";
  g.font = font(500, 36);
  g.fillText(spec.footer ?? "Beyin duelləri", 80, H - 90, W - 160);
  return c;
}

/** Shares the card as a PNG (system sheet), or downloads it when sharing files is not possible. */
export async function shareCard(spec: CardSpec): Promise<"shared" | "saved" | "none"> {
  const canvas = drawCard(spec);
  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/png"));
  if (!blob) return "none";
  const file = new File([blob], "beyin-duelleri.png", { type: "image/png" });
  const text = `${spec.title}: ${spec.big}`;
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title: az.app.name, text }).catch(() => {});
    return "shared";
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "saved";
}

/** A button that builds the card when pressed and shows the outcome in words. */
export function shareButton(spec: () => CardSpec, labels: { button: string; saved: string }): HTMLElement {
  const status = h("span", { class: "muted", role: "status" });
  const btn: HTMLButtonElement = h("button", { class: "btn block", onclick: async () => {
    btn.disabled = true;
    try {
      const r = await shareCard(spec());
      status.textContent = r === "saved" ? labels.saved : "";
    } finally {
      btn.disabled = false;
    }
  } }, labels.button) as HTMLButtonElement;
  return h("div", null, btn, status);
}
