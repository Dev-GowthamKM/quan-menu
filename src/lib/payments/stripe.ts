import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { STRIPE_API_BASE, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from "../server-env";

// Optional international payments through Stripe Checkout (hosted page). Uses the REST
// API directly to avoid another dependency.

export const stripeConfigured = () => !!STRIPE_SECRET_KEY;

export interface StripeSession {
  id: string;
  url: string | null;
  status: "open" | "complete" | "expired";
  payment_status: "paid" | "unpaid" | "no_payment_required";
  amount_total: number;
  currency: string;
  client_reference_id: string | null;
  payment_intent: string | { id: string; payment_method_types?: string[] } | null;
  metadata: Record<string, string>;
}

function form(data: Record<string, string | number | undefined>) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) if (v !== undefined) body.append(k, String(v));
  return body;
}

async function api<T>(path: string, data?: Record<string, string | number | undefined>, idempotencyKey?: string): Promise<T> {
  const res = await fetch(`${STRIPE_API_BASE}/v1${path}`, {
    method: data ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      ...(data ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: data ? form(data) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `Stripe request failed (${res.status})`);
  return body as T;
}

export function createCheckoutSession(p: {
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  email: string;
  successUrl: string;
  cancelUrl: string;
}) {
  return api<StripeSession>(
    "/checkout/sessions",
    {
      mode: "payment",
      success_url: p.successUrl,
      cancel_url: p.cancelUrl,
      client_reference_id: p.orderId,
      customer_email: p.email,
      "line_items[0][quantity]": 1,
      "line_items[0][price_data][currency]": p.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": p.amount,
      "line_items[0][price_data][product_data][name]": `Order ${p.orderNumber}`,
      "metadata[order_id]": p.orderId,
      "payment_intent_data[metadata][order_id]": p.orderId,
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    },
    `session-${p.orderId}-${p.amount}`,
  );
}

export const getCheckoutSession = (id: string) => api<StripeSession>(`/checkout/sessions/${encodeURIComponent(id)}?expand[]=payment_intent`);

export const createRefund = (paymentIntent: string, amount: number, idempotencyKey: string) =>
  api<{ id: string; status: string }>("/refunds", { payment_intent: paymentIntent, amount }, idempotencyKey);

/** Stripe-Signature: "t=timestamp,v1=hex"; signed payload is "timestamp.body". */
export function verifyStripeSignature(rawBody: string, header: string | null, toleranceSeconds = 300) {
  if (!STRIPE_WEBHOOK_SECRET || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false;
  const expected = createHmac("sha256", STRIPE_WEBHOOK_SECRET).update(`${t}.${rawBody}`).digest("hex");
  return header
    .split(",")
    .filter((kv) => kv.startsWith("v1="))
    .some((kv) => {
      const given = Buffer.from(kv.slice(3));
      const want = Buffer.from(expected);
      return given.length === want.length && timingSafeEqual(given, want);
    });
}
