// Cosmetic shop. Every item shows its exact price before purchase. Nothing here changes a match:
// no advantages, no random boxes, no chance items, no transfers between players.
export type ShopSlot = "avatar" | "frame" | "theme" | "title" | "effect";

export interface ShopItem {
  id: string;
  slot: ShopSlot;
  price: number;        // in Qızıl
  name: { az: string; ru: string };
  description: { az: string; ru: string };
  /** a CSS class of the client that draws the preview */
  look: string;
  /** a reward only: it is never sold, it comes from a season or an event */
  reward?: boolean;
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: "av_star", slot: "avatar", price: 50, name: { az: "Ulduz", ru: "Звезда" }, description: { az: "Sadə ulduz avatarı", ru: "Простой аватар-звезда" }, look: "av-star" },
  { id: "av_gem", slot: "avatar", price: 120, name: { az: "Qiymətli daş", ru: "Самоцвет" }, description: { az: "Kristal forma", ru: "Кристаллическая форма" }, look: "av-gem" },
  { id: "av_flame", slot: "avatar", price: 200, name: { az: "Alov", ru: "Пламя" }, description: { az: "Od effekti ilə avatar", ru: "Аватар с огнём" }, look: "av-flame" },
  { id: "fr_neon", slot: "frame", price: 80, name: { az: "Neon çərçivə", ru: "Неоновая рамка" }, description: { az: "Bənövşəyi neon kənar", ru: "Фиолетовый неоновый край" }, look: "fr-neon" },
  { id: "fr_gold", slot: "frame", price: 150, name: { az: "Qızıl çərçivə", ru: "Золотая рамка" }, description: { az: "Qızıl kənar", ru: "Золотой край" }, look: "fr-gold" },
  { id: "th_ocean", slot: "theme", price: 120, name: { az: "Okean mövzusu", ru: "Тема «Океан»" }, description: { az: "Mavi-yaşıl fon", ru: "Сине-зелёный фон" }, look: "th-ocean" },
  { id: "th_ember", slot: "theme", price: 180, name: { az: "Kül mövzusu", ru: "Тема «Угли»" }, description: { az: "Narıncı-qırmızı fon", ru: "Оранжево-красный фон" }, look: "th-ember" },
  { id: "ti_thinker", slot: "title", price: 60, name: { az: "Düşünən", ru: "Мыслитель" }, description: { az: "Profil titulu", ru: "Титул в профиле" }, look: "ti-thinker" },
  { id: "ti_quick", slot: "title", price: 90, name: { az: "Sürətli", ru: "Быстрый" }, description: { az: "Profil titulu", ru: "Титул в профиле" }, look: "ti-quick" },
  { id: "ef_confetti", slot: "effect", price: 100, name: { az: "Konfetti", ru: "Конфетти" }, description: { az: "Qələbə effekti", ru: "Эффект победы" }, look: "ef-confetti" },
  { id: "ef_spark", slot: "effect", price: 160, name: { az: "Qığılcım", ru: "Искры" }, description: { az: "Qələbə effekti", ru: "Эффект победы" }, look: "ef-spark" },
  { id: "ti_champion", slot: "title", price: 0, reward: true, name: { az: "Çempion", ru: "Чемпион" }, description: { az: "Mövsüm çempionu üçün titul", ru: "Титул за лучший результат сезона" }, look: "ti-thinker" },
];

export const SHOP_SLOTS: ShopSlot[] = ["avatar", "frame", "theme", "title", "effect"];
