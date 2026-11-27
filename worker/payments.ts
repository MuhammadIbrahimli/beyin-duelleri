// Payment and advertising architecture. Both are OFF (config/ads.ts). No provider is connected and no key is stored.
// An order is written and confirmed only by the server, and a paid order grants the item once (unique order id).
// While disabled, the endpoints answer 503 and nothing is charged or shown.
import { ADS, PAYMENTS } from "../config/ads";

/** What a real provider must do. None is registered, so every call is refused. */
export interface PaymentProvider {
  name: string;
  createCheckout(orderId: string, amount: number, currency: string): Promise<{ url: string }>;
  /** Verifies a provider callback on the server; returns the order id it confirms, or null. */
  verifyCallback(body: unknown, headers: Headers): Promise<string | null>;
}

export const providers: Record<string, PaymentProvider> = {};

export function paymentsEnabled(): boolean {
  return PAYMENTS.enabled && !!PAYMENTS.provider && !!providers[PAYMENTS.provider];
}

export function adsEnabled(): boolean {
  return ADS.enabled && Object.values(ADS.providers).some(Boolean);
}

export function adsStatus() {
  return {
    enabled: adsEnabled(),
    providers: Object.keys(ADS.providers).filter((k) => ADS.providers[k as keyof typeof ADS.providers]),
    maxPerHour: ADS.maxPerHour,
    blocked: ADS.blockedCategories,
  };
}

/** Order for a cosmetic item bought for real money. Refused while payments are off. */
export async function createOrder(db: D1Database, uid: string, itemId: string, amount: number, now: number) {
  if (!paymentsEnabled()) return { ok: false as const, reason: "payments_disabled" as const };
  const id = crypto.randomUUID();
  await db
    .prepare("INSERT INTO orders (id, user_id, item_id, amount, status, provider, created_at) VALUES (?, ?, ?, ?, 'created', ?, ?)")
    .bind(id, uid, itemId, amount, PAYMENTS.provider, now)
    .run();
  return { ok: true as const, id };
}
