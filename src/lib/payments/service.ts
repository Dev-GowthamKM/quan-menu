import "server-only";
import { processOutbox } from "../email";
import { orderUrl } from "../order-link";
import { storeOrigin, type StoreRef } from "../store";
import { supabaseService } from "../supabase/admin";
import type { OrderBrief } from "../types";
import * as rzp from "./razorpay";
import * as stripe from "./stripe";

// Payment orchestration. An order is marked paid only by confirm_order_payment, and that
// is only called after the provider itself has told us (its API, or a signed webhook)
// that the money was captured. Returning to the success page proves nothing by itself.
//
// Every call names the store: its Razorpay account is the one asked, and the database
// calls are limited to that store, so a payment can only ever settle that store's order.

export interface RazorpaySession {
  provider: "razorpay";
  keyId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
}

/** A Razorpay order for our order, reusing the open one so retries don't pile up. */
export async function razorpaySession(store: StoreRef, order: OrderBrief): Promise<RazorpaySession> {
  const keys = await rzp.razorpayKeys(store);
  if (!keys) throw new Error("Online payments are not configured yet.");
  const sb = supabaseService(store.id);
  const { data: open } = await sb.rpc("open_payment_session", { p_order_id: order.id, p_provider: "razorpay" });
  const existing = open as unknown as { provider_order_id: string | null } | null;
  if (existing?.provider_order_id) {
    return { provider: "razorpay", keyId: keys.keyId, razorpayOrderId: existing.provider_order_id, amount: order.grand_total, currency: order.currency };
  }
  const created = await rzp.createOrder(keys, {
    amount: order.grand_total,
    currency: order.currency,
    receipt: order.order_number,
    notes: { order_id: order.id, order_number: order.order_number },
  });
  const { error } = await sb.rpc("record_payment_session", {
    p_order_id: order.id,
    p_provider: "razorpay",
    p_provider_order_id: created.id,
    p_amount: created.amount,
    p_currency: created.currency,
  });
  if (error) throw new Error(error.hint || error.message);
  return { provider: "razorpay", keyId: keys.keyId, razorpayOrderId: created.id, amount: created.amount, currency: created.currency };
}

async function orderIdForRazorpay(store: StoreRef, payment: rzp.RazorpayPayment): Promise<string | null> {
  const notes = Array.isArray(payment.notes) ? {} : payment.notes;
  if (payment.order_id) {
    let query = supabaseService(store.id).from("payments").select("order_id").eq("provider", "razorpay").eq("provider_order_id", payment.order_id);
    if (store.id) query = query.eq("store_id", store.id);
    const { data } = await query.limit(1).maybeSingle();
    if (data) return data.order_id;
  }
  return notes.order_id ?? null;
}

export type SettleResult =
  | { status: "paid"; order: OrderBrief; result: string }
  | { status: "pending" | "failed" | "unknown"; order?: OrderBrief; message: string };

/**
 * Looks up a Razorpay payment with Razorpay's API, captures it if it is only
 * authorized, and applies it to our order. Safe to call repeatedly (from the browser's
 * return, the webhook and reconciliation) for the same payment.
 */
export async function settleRazorpayPayment(store: StoreRef, paymentId: string, expectedOrderId?: string): Promise<SettleResult> {
  const keys = await rzp.razorpayKeys(store);
  if (!keys) return { status: "unknown", message: "Razorpay isn't set up for this store." };
  let payment = await rzp.fetchPayment(keys, paymentId);
  const orderId = await orderIdForRazorpay(store, payment);
  if (!orderId) return { status: "unknown", message: "This payment does not belong to an order in this store." };
  if (expectedOrderId && orderId !== expectedOrderId) return { status: "unknown", message: "Payment and order do not match." };
  const sb = supabaseService(store.id);

  if (payment.status === "authorized") {
    // Capture only the exact order amount (our order total never changes after placing).
    let orderQuery = sb.from("orders").select("grand_total, currency").eq("id", orderId);
    if (store.id) orderQuery = orderQuery.eq("store_id", store.id);
    const { data: order } = await orderQuery.maybeSingle();
    if (order && Number(order.grand_total) === payment.amount && order.currency === payment.currency) {
      try {
        payment = await rzp.capturePayment(keys, payment.id, payment.amount, payment.currency);
      } catch (e) {
        console.error("[payments] capture failed:", (e as Error).message);
        payment = await rzp.fetchPayment(keys, paymentId);
      }
    }
  }

  if (payment.status === "failed") {
    const { data } = await sb.rpc("record_payment_failure", {
      p_order_id: orderId,
      p_provider: "razorpay",
      p_provider_order_id: payment.order_id ?? "",
      p_provider_payment_id: payment.id,
      p_method: payment.method,
      p_error_code: payment.error_code ?? "",
      p_error_description: payment.error_description ?? "",
    });
    return { status: "failed", order: data as unknown as OrderBrief, message: payment.error_description || "The payment failed." };
  }
  if (payment.status !== "captured" && payment.status !== "refunded") {
    return { status: "pending", message: "The payment has not been completed yet." };
  }

  const { data, error } = await sb.rpc("confirm_order_payment", {
    p_order_id: orderId,
    p_provider: "razorpay",
    p_provider_order_id: payment.order_id ?? "",
    p_provider_payment_id: payment.id,
    p_amount: payment.amount,
    p_currency: payment.currency,
    p_method: payment.method,
    p_details: rzp.paymentDetails(payment),
  });
  if (error) throw new Error(error.hint || error.message);
  const outcome = data as unknown as OrderBrief & { result: string; payment_id: string };
  await handleExceptions(store, outcome, payment.amount, `Automatic refund (${outcome.result})`);
  return { status: "paid", order: outcome, result: outcome.result };
}

/** Duplicate payments, wrong amounts and payments for sold-out expired orders are refunded straight away. */
async function handleExceptions(store: StoreRef, outcome: { id: string; result: string; payment_id: string }, amount: number, reason: string) {
  if (!["duplicate_payment", "refund_required", "amount_mismatch"].includes(outcome.result)) return;
  const sb = supabaseService(store.id);
  const { data, error } = await sb.rpc("system_begin_refund", {
    p_order_id: outcome.id,
    p_payment_id: outcome.payment_id,
    p_amount: amount,
    p_reason: reason,
  });
  if (error) {
    console.error("[payments] automatic refund could not start:", error.message);
    return;
  }
  await executeRefund(store, data as unknown as RefundStart);
}

export interface RefundStart {
  refund_id: string;
  status: string;
  amount: number;
  provider: "razorpay" | "stripe" | "cod" | "manual";
  provider_payment_id: string | null;
  currency: string;
  order_number: string;
  needs_provider_call: boolean;
}

/** Sends a refund started in the database to the payment provider and records the result. */
export async function executeRefund(store: StoreRef, refund: RefundStart): Promise<{ ok: boolean; message: string }> {
  if (!refund.needs_provider_call) return { ok: true, message: "Refund recorded." };
  const sb = supabaseService(store.id);
  try {
    if (refund.provider === "razorpay") {
      const keys = await rzp.razorpayKeys(store);
      if (!keys) throw new Error("Razorpay isn't set up for this store.");
      const r = await rzp.refundPayment(keys, refund.provider_payment_id!, refund.amount, { refund_id: refund.refund_id, order_number: refund.order_number });
      await sb.rpc("complete_refund", {
        p_refund_id: refund.refund_id,
        p_provider_refund_id: r.id,
        p_status: r.status === "failed" ? "failed" : r.status === "processed" ? "processed" : "pending",
        p_error: "",
      });
      return { ok: r.status !== "failed", message: r.status === "processed" ? "Refund processed." : "Refund requested. Razorpay will confirm it shortly." };
    }
    if (refund.provider === "stripe") {
      const r = await stripe.createRefund(refund.provider_payment_id!, refund.amount, `refund-${refund.refund_id}`);
      await sb.rpc("complete_refund", {
        p_refund_id: refund.refund_id,
        p_provider_refund_id: r.id,
        p_status: r.status === "succeeded" ? "processed" : r.status === "failed" ? "failed" : "pending",
        p_error: "",
      });
      return { ok: r.status !== "failed", message: r.status === "succeeded" ? "Refund processed." : "Refund requested." };
    }
    return { ok: false, message: "This payment cannot be refunded automatically." };
  } catch (e) {
    const message = (e as Error).message;
    console.error("[payments] refund failed:", message);
    await sb.rpc("complete_refund", { p_refund_id: refund.refund_id, p_provider_refund_id: "", p_status: "failed", p_error: message });
    return { ok: false, message: `The payment provider rejected the refund: ${message}` };
  } finally {
    await processOutbox();
  }
}

/** Stripe Checkout for an order (optional international cards; the home store only). */
export async function stripeSession(store: StoreRef, order: OrderBrief) {
  if (!stripe.stripeConfigured(store)) throw new Error("Card payments through Stripe are not configured.");
  const url = orderUrl(storeOrigin(store), order.order_number, order.id);
  const session = await stripe.createCheckoutSession({
    orderId: order.id,
    orderNumber: order.order_number,
    amount: order.grand_total,
    currency: order.currency,
    email: order.email,
    successUrl: `${url}&placed=1&stripe_session={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${url}&cancelled=1`,
  });
  await supabaseService(store.id).rpc("record_payment_session", {
    p_order_id: order.id,
    p_provider: "stripe",
    p_provider_order_id: session.id,
    p_amount: order.grand_total,
    p_currency: order.currency,
  });
  return { provider: "stripe" as const, url: session.url! };
}

/**
 * Confirms a Stripe Checkout session with Stripe's API before marking the order paid.
 * Stripe is the home store's only, so this works on the home store.
 */
export async function settleStripeSession(store: StoreRef, sessionId: string): Promise<SettleResult> {
  if (!store.isHome) return { status: "unknown", message: "Stripe is only available for the main store." };
  const session = await stripe.getCheckoutSession(sessionId);
  const orderId = session.metadata?.order_id || session.client_reference_id;
  if (!orderId) return { status: "unknown", message: "Unknown checkout session." };
  if (session.payment_status !== "paid") {
    return { status: session.status === "expired" ? "failed" : "pending", message: "The payment has not been completed yet." };
  }
  const intent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  const { data, error } = await supabaseService(store.id).rpc("confirm_order_payment", {
    p_order_id: orderId,
    p_provider: "stripe",
    p_provider_order_id: session.id,
    p_provider_payment_id: intent || session.id,
    p_amount: session.amount_total,
    p_currency: session.currency.toUpperCase(),
    p_method: "card",
    p_details: {},
  });
  if (error) throw new Error(error.hint || error.message);
  const outcome = data as unknown as OrderBrief & { result: string; payment_id: string };
  await handleExceptions(store, outcome, session.amount_total, `Automatic refund (${outcome.result})`);
  return { status: "paid", order: outcome, result: outcome.result };
}
