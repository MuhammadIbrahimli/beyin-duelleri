// Cosmetic shop: catalog, purchase from Qızıl, inventory and equipping. The price is the one in config/shop.ts,
// shown before purchase. A purchase is one ledger debit (once per item) plus one inventory row.
import { SHOP_ITEMS, SHOP_SLOTS, type ShopItem } from "../config/shop";
import { debit, balanceOf } from "./economy-core";

export async function catalog(db: D1Database, uid: string) {
  const owned = await db.prepare("SELECT item_id FROM inventory WHERE user_id = ?").bind(uid).all<{ item_id: string }>();
  const eq = await db.prepare("SELECT slot, item_id FROM equipped WHERE user_id = ?").bind(uid).all<{ slot: string; item_id: string }>();
  const ownedSet = new Set(owned.results.map((r) => r.item_id));
  const equippedSet = new Set(eq.results.map((r) => r.item_id));
  return {
    slots: SHOP_SLOTS,
    balance: await balanceOf(db, uid, "qizil"),
    items: SHOP_ITEMS.map((i) => ({
      id: i.id,
      slot: i.slot,
      price: i.price,
      name: i.name,
      description: i.description,
      look: i.look,
      owned: ownedSet.has(i.id),
      equipped: equippedSet.has(i.id),
    })),
    equipped: Object.fromEntries(eq.results.map((r) => [r.slot, r.item_id])),
  };
}

export const itemById = (id: string): ShopItem | undefined => SHOP_ITEMS.find((i) => i.id === id);

export type BuyResult =
  | { ok: true; balance: number }
  | { ok: false; reason: "unknown" | "owned" | "insufficient" };

export async function buy(db: D1Database, uid: string, itemId: string, now: number): Promise<BuyResult> {
  const item = itemById(itemId);
  if (!item) return { ok: false, reason: "unknown" };
  const has = await db.prepare("SELECT 1 AS x FROM inventory WHERE user_id = ? AND item_id = ?").bind(uid, itemId).first();
  if (has) return { ok: false, reason: "owned" };
  const res = await debit(db, uid, "qizil", item.price, `buy:${uid}:${itemId}`, "purchase", now);
  if (res === "insufficient") return { ok: false, reason: "insufficient" };
  if (res === "duplicate") return { ok: false, reason: "owned" };
  await db.prepare("INSERT OR IGNORE INTO inventory (user_id, item_id, acquired_at) VALUES (?, ?, ?)").bind(uid, itemId, now).run();
  return { ok: true, balance: await balanceOf(db, uid, "qizil") };
}

export type EquipResult = { ok: true } | { ok: false; reason: "unknown" | "not_owned" };

export async function equip(db: D1Database, uid: string, itemId: string): Promise<EquipResult> {
  const item = itemById(itemId);
  if (!item) return { ok: false, reason: "unknown" };
  const has = await db.prepare("SELECT 1 AS x FROM inventory WHERE user_id = ? AND item_id = ?").bind(uid, itemId).first();
  if (!has) return { ok: false, reason: "not_owned" };
  await db
    .prepare("INSERT INTO equipped (user_id, slot, item_id) VALUES (?, ?, ?) ON CONFLICT(user_id, slot) DO UPDATE SET item_id = excluded.item_id")
    .bind(uid, item.slot, itemId)
    .run();
  return { ok: true };
}

export async function unequip(db: D1Database, uid: string, slot: string): Promise<boolean> {
  if (!SHOP_SLOTS.includes(slot as never)) return false;
  await db.prepare("DELETE FROM equipped WHERE user_id = ? AND slot = ?").bind(uid, slot).run();
  return true;
}

/** The items a player shows to others (profile, VS, results): equipped only. */
export async function equippedOf(db: D1Database, uid: string): Promise<Record<string, string>> {
  const rows = await db.prepare("SELECT slot, item_id FROM equipped WHERE user_id = ?").bind(uid).all<{ slot: string; item_id: string }>();
  return Object.fromEntries(rows.results.map((r) => [r.slot, r.item_id]));
}
