import { h } from "../dom";
import { az } from "../i18n";
import { renderCard } from "./draw";
import { fileName, type CardModel, type Format } from "./model";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Share through the system sheet when files are supported, otherwise fall back to a download. */
export async function shareOrDownload(blob: Blob, name: string, text: string) {
  const file = new File([blob], name, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return;
    } catch (e: any) {
      if (e?.name === "AbortError") return; // the user closed the sheet
    }
  }
  download(blob, name);
}

/** Preview sheet: pick the format, then share or save the PNG. */
export function openCardSheet(model: CardModel, kind: string, shareText: string, onShare?: () => void) {
  let format: Format = "story";
  let blob: Blob | null = null;
  let objectUrl = "";

  const img = h("img", { class: "card-preview", alt: "" }) as HTMLImageElement;
  const shareBtn = h("button", { class: "btn primary block", disabled: true }, az.card.share) as HTMLButtonElement;
  const saveBtn = h("button", { class: "btn block", disabled: true }, az.card.download) as HTMLButtonElement;
  const chip = (f: Format, label: string) => h("button", { class: "chip", "data-f": f, onclick: () => pick(f) }, label);
  const chips = h("div", { class: "row" }, chip("story", az.card.story), chip("post", az.card.post));
  const close = () => { if (objectUrl) URL.revokeObjectURL(objectUrl); overlay.remove(); };
  const overlay = h("div", { class: "sheet", role: "dialog" },
    h("div", { class: "sheet-body" }, chips, img, shareBtn, saveBtn, h("button", { class: "link", onclick: close }, az.card.close)));
  document.body.append(overlay);

  async function pick(f: Format) {
    format = f;
    chips.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", c.getAttribute("data-f") === f));
    shareBtn.disabled = saveBtn.disabled = true;
    blob = await renderCard(model, f);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(blob);
    img.src = objectUrl;
    shareBtn.disabled = saveBtn.disabled = false;
  }
  shareBtn.addEventListener("click", () => { if (blob) { void shareOrDownload(blob, fileName(kind, model.slug, format), shareText); onShare?.(); } });
  saveBtn.addEventListener("click", () => { if (blob) { download(blob, fileName(kind, model.slug, format)); onShare?.(); } });
  void pick("story");
}
