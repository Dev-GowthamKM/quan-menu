"use server";
import { after } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { cartIdentity } from "@/lib/cart-session";
import { sqlNull } from "@/lib/db";
import { processOutbox } from "@/lib/email";
import { fail, friendlyError, ok, type ActionResult } from "@/lib/errors";
import { findAccessibleOrder } from "@/lib/orders";
import { orderPath } from "@/lib/order-link";
import * as rzp from "@/lib/payments/razorpay";
import { razorpaySession, settleRazorpayPayment, settleStripeSession, stripeSession, type RazorpaySession } from "@/lib/payments/service";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseService } from "@/lib/supabase/admin";
import type { OrderBrief } from "@/lib/types";

const phone = z.string().trim().regex(/^\+?[0-9][0-9 ()-]{6,19}$/, "Enter a valid phone number.");
const address = z.object({
  full_name: z.string().trim().min(1, "Enter the recipient's full name.").max(120),
  phone,
  line1: z.string().trim().min(1, "Enter the house number and street.").max(200),
  line2: z.string().trim().max(200).default(""),
  landmark: z.string().trim().max(120).default(""),
  city: z.string().trim().min(1, "Enter the city.").max(100),
  state: z.string().trim().min(1, "Choose the state.").max(100),
  postal_code: z.string().trim().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit PIN code."),
  country: z.literal("IN").default("IN"),
});

const placeSchema = z.object({
  idempotencyKey: z.string().uuid(),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  phone,
  address,
  billing: address.nullable().default(null),
  rateId: z.string().uuid("Choose a delivery option."),
  paymentMethod: z.enum(["razorpay", "stripe", "cod"]),
  note: z.string().trim().max(500).default(""),
  saveAddress: z.boolean().default(false),
  whatsapp: z.boolean().default(false),
});

export type PlaceOrderInput = z.input<typeof placeSchema>;

export type NextStep =
  | { type: "redirect"; url: string }
  | { type: "razorpay"; session: RazorpaySession; orderUrl: string; prefill: { name: string; email: string; contact: string } }
  | { type: "stripe"; url: string };

export async function placeOrder(input: PlaceOrderInput): Promise<ActionResult<{ order: OrderBrief; next: NextStep }>> {
  const parsed = placeSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check your details.");
  if (!(await rateLimit("checkout", 10, 600))) return fail("Too many checkout attempts. Please wait a few minutes and try again.");
  const p = parsed.data;
  const id = await cartIdentity();
  // Signed-in customers' orders always use their account email.
  const email = id.email ?? p.email;
  const sb = supabaseService();
  // Choices that travel with the order (copied from the cart when it's placed).
  await sb.rpc("cart_set_contact", { p_user_id: sqlNull(id.userId), p_token: sqlNull(id.token), p_contact: { whatsapp_opt_in: p.whatsapp } });

  const { data, error } = await sb.rpc("place_order", {
    p_user_id: sqlNull(id.userId),
    p_cart_token: sqlNull(id.token),
    p_idempotency_key: p.idempotencyKey,
    p_email: email,
    p_phone: p.phone,
    p_shipping_address: p.address,
    p_billing_address: sqlNull(p.billing),
    p_rate_id: p.rateId,
    p_payment_method: p.paymentMethod,
    p_customer_note: p.note,
    p_save_address: p.saveAddress && !!id.userId,
  });
  if (error) {
    if (!error.hint) console.error("[checkout] place_order:", error.message);
    return fail(friendlyError(error, "We couldn't place your order. Please try again."));
  }
  const order = data as unknown as OrderBrief;
  const url = orderPath(order.order_number, order.id, "&placed=1");

  if (order.status === "confirmed") {
    after(() => processOutbox());
    return ok({ order, next: { type: "redirect", url } });
  }
  if (order.status !== "pending_payment") return fail("This order can no longer be paid. Please start again.");
  try {
    if (order.payment_method === "stripe") {
      const s = await stripeSession(order);
      return ok({ order, next: { type: "stripe", url: s.url } });
    }
    const session = await razorpaySession(order);
    return ok({
      order,
      next: { type: "razorpay", session, orderUrl: url, prefill: { name: order.customer_name, email: order.email, contact: order.phone } },
    });
  } catch (e) {
    console.error("[checkout] payment session:", (e as Error).message);
    return fail("We couldn't start the payment. Your items are reserved; please try again in a moment.");
  }
}

const verifySchema = z.object({
  orderNumber: z.string().min(3).max(32),
  key: z.string().min(10).max(64),
  razorpay_order_id: z.string().min(5).max(64),
  razorpay_payment_id: z.string().min(5).max(64),
  razorpay_signature: z.string().min(10).max(256),
});

/**
 * Called by the browser when Razorpay Checkout reports success. The signature proves
 * the ids came from Razorpay; the order is only marked paid after fetching the payment
 * from Razorpay's API and checking it was captured for the right amount.
 */
export async function verifyRazorpayPayment(input: z.input<typeof verifySchema>): Promise<ActionResult<{ status: string; url: string }>> {
  const parsed = verifySchema.safeParse(input);
  if (!parsed.success) return fail("Invalid payment response.");
  const p = parsed.data;
  if (!(await rateLimit("verify", 30, 300))) return fail("Too many requests. Please wait a moment.");
  const order = await findAccessibleOrder(p.orderNumber, p.key);
  if (!order) return fail("Order not found.");
  if (!rzp.verifyCheckoutSignature(p.razorpay_order_id, p.razorpay_payment_id, p.razorpay_signature)) {
    return fail("We couldn't verify this payment. If money was taken, it will be confirmed or refunded automatically.");
  }
  try {
    const res = await settleRazorpayPayment(p.razorpay_payment_id, order.id);
    after(() => processOutbox());
    return ok({ status: res.status, url: orderPath(order.order_number, order.id, "&placed=1") });
  } catch (e) {
    console.error("[checkout] verify:", (e as Error).message);
    // The webhook will still confirm the payment; send the customer to their order page.
    return ok({ status: "pending", url: orderPath(order.order_number, order.id, "&placed=1") });
  }
}

/** Razorpay Checkout reported a failed attempt; check with Razorpay before recording it. */
export async function reportPaymentFailure(orderNumber: string, key: string, paymentId: string | null): Promise<ActionResult<null>> {
  const order = await findAccessibleOrder(orderNumber, key);
  if (!order || !paymentId || !/^pay_[A-Za-z0-9]+$/.test(paymentId)) return ok(null);
  if (!(await rateLimit("payfail", 20, 300))) return ok(null);
  try {
    await settleRazorpayPayment(paymentId, order.id);
  } catch (e) {
    console.error("[checkout] failure report:", (e as Error).message);
  }
  return ok(null);
}

/** "Pay now" on an unpaid order: keeps (or re-reserves) the items and reopens payment. */
export async function retryPayment(orderNumber: string, key: string | null): Promise<ActionResult<NextStep>> {
  if (!(await rateLimit("retry", 10, 300))) return fail("Too many attempts. Please wait a moment.");
  const access = await findAccessibleOrder(orderNumber, key);
  if (!access) return fail("Order not found.");
  const { data, error } = await supabaseService().rpc("prepare_order_payment", { p_order_id: access.id });
  if (error) return fail(friendlyError(error, "This order can't be paid any more."));
  const order = data as unknown as OrderBrief;
  try {
    if (order.payment_method === "stripe") return ok({ type: "stripe", url: (await stripeSession(order)).url });
    const session = await razorpaySession(order);
    return ok({
      type: "razorpay",
      session,
      orderUrl: orderPath(order.order_number, order.id, "&placed=1"),
      prefill: { name: order.customer_name, email: order.email, contact: order.phone },
    });
  } catch (e) {
    console.error("[checkout] retry:", (e as Error).message);
    return fail("We couldn't start the payment. Please try again in a moment.");
  }
}

/** Returning from Stripe Checkout: confirm the session with Stripe's API. */
export async function confirmStripeReturn(orderNumber: string, key: string, sessionId: string): Promise<ActionResult<{ status: string }>> {
  const order = await findAccessibleOrder(orderNumber, key);
  if (!order || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return fail("Order not found.");
  try {
    const res = await settleStripeSession(sessionId);
    after(() => processOutbox());
    return ok({ status: res.status });
  } catch (e) {
    console.error("[checkout] stripe return:", (e as Error).message);
    return ok({ status: "pending" });
  }
}

/** Current state of an order, for the confirmation page while a payment settles. */
export async function orderStatus(orderNumber: string, key: string | null): Promise<{ status: string; payment_status: string } | null> {
  const access = await findAccessibleOrder(orderNumber, key);
  if (!access) return null;
  const { data } = await supabaseService().from("orders").select("status, payment_status").eq("id", access.id).single();
  return data;
}

export async function signedInEmail() {
  return (await getUser())?.email ?? null;
}
