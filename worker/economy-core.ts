// Account XP and the one cosmetic currency (Qızıl) as a server-side ledger.
// Every change is a ledger row with a unique `ref`. The row and the balance change are written in one batch, so a
// repeated `ref` fails the whole batch (UNIQUE) and nothing changes: the same reward or purchase is applied once.
// The balance cannot go below zero (a conditional update and a CHECK on the wallet).
export type Currency = "xp" | "qizil";

/** Asia/Baku is UTC+4 all year (no daylight saving), so the day boundary is a fixed offset. */
const BAKU_OFFSET_MS = 4 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const bakuDayStart = (now: number): number => Math.floor((now + BAKU_OFFSET_MS) / DAY_MS) * DAY_MS - BAKU_OFFSET_MS;
export const bakuDay = (now: number): string => new Date(now + BAKU_OFFSET_MS).toISOString().slice(0, 10);

const isUnique = (e: unknown) => /UNIQUE constraint failed/i.test(String((e as Error)?.message ?? e));

/** Adds `delta` (>0) to a balance once for this `ref`. Returns false when this ref was already applied. */
export async function credit(db: D1Database, userId: string, currency: Currency, delta: number, ref: string, reason: string, now: number): Promise<boolean> {
  if (!(delta > 0)) return false;
  try {
    await db.batch([
      db.prepare("INSERT OR IGNORE INTO wallets (user_id, currency, balance) VALUES (?, ?, 0)").bind(userId, currency),
      db
        .prepare(
          "INSERT INTO econ_ledger (user_id, currency, delta, reason, ref, balance_after, created_at) " +
            "SELECT ?, ?, ?, ?, ?, balance + ?, ? FROM wallets WHERE user_id = ? AND currency = ?",
        )
        .bind(userId, currency, delta, reason, ref, delta, now, userId, currency),
      db.prepare("UPDATE wallets SET balance = balance + ? WHERE user_id = ? AND currency = ?").bind(delta, userId, currency),
    ]);
    return true;
  } catch (e) {
    if (isUnique(e)) return false; // this ref was already applied; the batch was rolled back
    throw e;
  }
}

/** Takes `amount` from a balance once for this `ref`. "insufficient" when the balance is too low, "duplicate" when already applied. */
export async function debit(db: D1Database, userId: string, currency: Currency, amount: number, ref: string, reason: string, now: number): Promise<"ok" | "insufficient" | "duplicate"> {
  if (!(amount > 0)) return "insufficient";
  if (await db.prepare("SELECT 1 AS x FROM econ_ledger WHERE ref = ?").bind(ref).first()) return "duplicate";
  await db.prepare("INSERT OR IGNORE INTO wallets (user_id, currency, balance) VALUES (?, ?, 0)").bind(userId, currency).run();
  try {
    const res = await db.batch([
      db
        .prepare(
          "INSERT INTO econ_ledger (user_id, currency, delta, reason, ref, balance_after, created_at) " +
            "SELECT ?, ?, ?, ?, ?, balance - ?, ? FROM wallets WHERE user_id = ? AND currency = ? AND balance >= ?",
        )
        .bind(userId, currency, -amount, reason, ref, amount, now, userId, currency, amount),
      db.prepare("UPDATE wallets SET balance = balance - ? WHERE user_id = ? AND currency = ? AND balance >= ?").bind(amount, userId, currency, amount),
    ]);
    // both statements see the same balance, so they agree: no row written means nothing was taken
    return (res[0].meta.changes ?? 0) === 1 ? "ok" : "insufficient";
  } catch (e) {
    if (isUnique(e)) return "duplicate";
    throw e;
  }
}

export async function balanceOf(db: D1Database, userId: string, currency: Currency): Promise<number> {
  const row = await db.prepare("SELECT balance FROM wallets WHERE user_id = ? AND currency = ?").bind(userId, currency).first<{ balance: number }>();
  return row?.balance ?? 0;
}

/** Sum of a currency gained today (Baku day) from one reason, used for the daily caps. */
export async function gainedToday(db: D1Database, userId: string, currency: Currency, reason: string, now: number): Promise<number> {
  const row = await db
    .prepare("SELECT COALESCE(SUM(delta), 0) AS s FROM econ_ledger WHERE user_id = ? AND currency = ? AND reason = ? AND created_at >= ?")
    .bind(userId, currency, reason, bakuDayStart(now))
    .first<{ s: number }>();
  return row?.s ?? 0;
}
