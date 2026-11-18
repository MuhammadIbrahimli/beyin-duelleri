// Optional profile sheet: name, city, email. Asked once after the first finished result, editable later in Pasport.
import { CITY_CODES } from "../config/cities";
import { me, saveProfile } from "./api";
import { h } from "./dom";
import { az, t } from "./i18n";

export function openProfileSheet(onDone?: () => void) {
  const u = me();
  if (!u) return;
  let city: string | null = u.city;

  const name = h("input", { class: "field", value: u.nickname, maxlength: 20, autocomplete: "off", "aria-label": az.profile.name }) as HTMLInputElement;
  const email = h("input", { class: "field", type: "email", value: u.email ?? "", placeholder: az.profile.emailPh, autocomplete: "email", "aria-label": az.profile.email }) as HTMLInputElement;
  const consent = h("input", { type: "checkbox", id: "consent", ...(u.emailConsent ? { checked: "" } : {}) }) as HTMLInputElement;
  const err = h("p", { class: "soft", role: "alert" });
  const chips = h("div", { class: "chips" }, ...CITY_CODES.map((c) =>
    h("button", { class: "chip" + (c === city ? " on" : ""), type: "button", onclick: (e: Event) => {
      city = c === city ? null : c;
      chips.querySelectorAll(".chip").forEach((x) => x.classList.toggle("on", x === (e.currentTarget as HTMLElement) && city === c));
    } }, az.cities[c])));
  const close = () => overlay.remove();

  const save = h("button", { class: "btn primary block" }, az.profile.save) as HTMLButtonElement;
  save.addEventListener("click", async () => {
    err.textContent = "";
    save.disabled = true;
    try {
      await saveProfile({
        nickname: name.value, city, email: email.value.trim(), emailConsent: consent.checked, profileDone: true,
      });
      close();
      onDone?.();
    } catch (e: any) {
      err.textContent = e.code === "bad_email" ? az.profile.errEmail : e.code === "bad_name" ? (az.profile.errName[e.reason] ?? az.profile.errName.length) : az.common.error;
      save.disabled = false;
    }
  });
  const skip = h("button", { class: "link", type: "button", onclick: async () => {
    await saveProfile({ profileDone: true }).catch(() => {});
    close();
    onDone?.();
  } }, az.profile.skip);
  const random = h("button", { class: "link", type: "button", onclick: async () => {
    const r = await saveProfile({ rerollNickname: true }).catch(() => null);
    if (r) name.value = r.nickname;
  } }, az.profile.random);

  const overlay = h("div", { class: "sheet", role: "dialog", "aria-label": az.profile.title },
    h("div", { class: "sheet-body" },
      h("h1", null, az.profile.title),
      h("p", { class: "muted" }, az.profile.sub),
      h("label", { class: "lbl" }, az.profile.name, name), random,
      h("div", { class: "lbl" }, az.profile.city, chips),
      h("label", { class: "lbl" }, az.profile.email, email),
      h("label", { class: "toggle", for: "consent" }, consent, az.profile.consent),
      h("p", { class: "muted" }, t("profile.privacyNote")),
      err, save, skip));
  document.body.append(overlay);
  name.focus();
}
