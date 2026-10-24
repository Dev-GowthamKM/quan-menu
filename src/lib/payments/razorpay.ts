import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { RAZORPAY_KEY_ID } from "../env";
import { RAZORPAY_KEY_SECRET, RAZORPAY_TEST_API_BASE, RAZORPAY_WEBHOOK_SECRET } from "../server-env";
import { storeSecrets } from "../store-secrets";

// Minimal Razorpay REST client (https://razorpay.com/docs/api/). Card details never
// touch our servers: customers pay in Razorpay's hosted Checkout, and we only see ids.
// Each store takes payments into its own Razorpay account, so every call names the keys.

export interface RazorpayKeys {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

/**
 * The Razorpay account a store takes payments with: the keys its admins saved in
 * Settings › Payments, or for the home store the server's environment variables.
 */
export async function razorpayKeys(store: { id: string | null; isHome: boolean }): Promise<RazorpayKeys | null> {
  if (store.id) {
    const own = await storeSecrets(store.id);
    if (own.razorpay_key_id && own.razorpay_key_secret) {
      return { keyId: own.razorpay_key_id, keySecret: own.razorpay_key_secret, webhookSecret: own.razorpay_webhook_secret ?? "" };
    }
  }
  if (store.isHome && RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
    return { keyId: RAZORPAY_KEY_ID, keySecret: RAZORPAY_KEY_SECRET, webhookSecret: RAZORPAY_WEBHOOK_SECRET };
  }
  return null;
}

/** Live keys always go to Razorpay; test keys may go to a local mock in tests. */
const apiBase = (keys: RazorpayKeys) => (keys.keyId.startsWith("rzp_live_") ? "https://api.razorpay.com" : RAZORPAY_TEST_API_BASE);

export class RazorpayError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string | null;
  status: "created" | "attempted" | "paid";
  notes: Record<string, string>;
}

export interface RazorpayPayment {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  method: string;
  captured: boolean;
  amount_refunded: number;
  error_code: string | null;
  error_description: string | null;
  bank: string | null;
  wallet: string | null;
  vpa: string | null;
  card?: { network?: string; last4?: string; type?: string } | null;
  notes: Record<string, string> | [];
  created_at: number;
}

export interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number;
  status: "pending" | "processed" | "failed";
}

async function api<T>(keys: RazorpayKeys, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${apiBase(keys)}/v1${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new RazorpayError(body?.error?.description || `Razorpay request failed (${res.status})`, res.status, body?.error?.code);
  }
  return body as T;
}

export const createOrder = (keys: RazorpayKeys, p: { amount: number; currency: string; receipt: string; notes: Record<string, string> }) =>
  api<RazorpayOrder>(keys, "/orders", { method: "POST", body: p });

export const fetchPayment = (keys: RazorpayKeys, paymentId: string) => api<RazorpayPayment>(keys, `/payments/${encodeURIComponent(paymentId)}`);

export const fetchOrderPayments = (keys: RazorpayKeys, orderId: string) =>
  api<{ items: RazorpayPayment[] }>(keys, `/orders/${encodeURIComponent(orderId)}/payments`).then((r) => r.items ?? []);

export const capturePayment = (keys: RazorpayKeys, paymentId: string, amount: number, currency: string) =>
  api<RazorpayPayment>(keys, `/payments/${encodeURIComponent(paymentId)}/capture`, { method: "POST", body: { amount, currency } });

export const refundPayment = (keys: RazorpayKeys, paymentId: string, amount: number, notes: Record<string, string>) =>
  api<RazorpayRefund>(keys, `/payments/${encodeURIComponent(paymentId)}/refund`, { method: "POST", body: { amount, notes, speed: "normal" } });

export const fetchRefund = (keys: RazorpayKeys, refundId: string) => api<RazorpayRefund>(keys, `/refunds/${encodeURIComponent(refundId)}`);

function safeEqualHex(expected: string, given: string) {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(given || ""), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The signature Razorpay Checkout returns to the browser after a payment. */
export function verifyCheckoutSignature(keys: RazorpayKeys, orderId: string, paymentId: string, signature: string) {
  if (!keys.keySecret) return false;
  const expected = createHmac("sha256", keys.keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqualHex(expected, signature);
}

/** X-Razorpay-Signature on webhooks: HMAC-SHA256 of the raw request body. */
export function verifyWebhookSignature(keys: RazorpayKeys, rawBody: string, signature: string | null) {
  if (!keys.webhookSecret || !signature) return false;
  const expected = createHmac("sha256", keys.webhookSecret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}

/** What we keep about a payment: method details for support, never card numbers. */
export function paymentDetails(p: RazorpayPayment) {
  return {
    method: p.method,
    bank: p.bank ?? undefined,
    wallet: p.wallet ?? undefined,
    vpa: p.vpa ? p.vpa.replace(/^(.{2}).*(@.*)$/, "$1***$2") : undefined,
    card: p.card ? { network: p.card.network, last4: p.card.last4, type: p.card.type } : undefined,
  };
}
