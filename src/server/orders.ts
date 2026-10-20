"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { sqlNull } from "@/lib/db";
import { processOutbox } from "@/lib/email";
import { fail, friendlyError, ok, type ActionResult } from "@/lib/errors";
import { findAccessibleOrder } from "@/lib/orders";
import { orderPath } from "@/lib/order-link";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseService } from "@/lib/supabase/admin";

export async function cancelOrder(orderNumber: string, key: string | null, reason: string): Promise<ActionResult<{ result: string }>> {
  const access = await findAccessibleOrder(orderNumber, key);
  if (!access) return fail("Order not found.");
  const user = await getUser();
  const { data, error } = await supabaseService().rpc("customer_cancel_order", {
    p_order_id: access.id,
    // Signed links act for the order's owner; account access is checked again in SQL.
    p_user_id: sqlNull(access.via === "account" ? user?.id : access.user_id),
    p_reason: String(reason || "").slice(0, 100),
  });
  if (error) return fail(friendlyError(error, "We couldn't cancel this order."));
  after(() => processOutbox());
  revalidatePath(`/orders/${orderNumber}`);
  revalidatePath("/account/orders");
  const result = (data as { result: string }).result;
  return ok(
    { result },
    result === "requested" ? "We've received your cancellation request. You'll be refunded once it's approved." : "Your order has been cancelled.",
  );
}

const returnSchema = z.object({
  items: z.array(z.object({ order_item_id: z.string().uuid(), quantity: z.number().int().min(1).max(20) })).min(1, "Choose at least one item to return."),
  reason: z.string().trim().min(1, "Tell us why you're returning the items.").max(100),
  details: z.string().trim().max(2000).default(""),
});

export async function requestReturn(orderNumber: string, key: string | null, input: z.input<typeof returnSchema>): Promise<ActionResult<null>> {
  const parsed = returnSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  if (!(await rateLimit("return", 10, 3600))) return fail("Too many requests. Please try again later.");
  const access = await findAccessibleOrder(orderNumber, key);
  if (!access) return fail("Order not found.");
  const user = await getUser();
  const { error } = await supabaseService().rpc("customer_request_return", {
    p_order_id: access.id,
    p_user_id: sqlNull(access.via === "account" ? user?.id : access.user_id),
    p_items: parsed.data.items,
    p_reason: parsed.data.reason,
    p_details: parsed.data.details,
  });
  if (error) return fail(friendlyError(error, "We couldn't start your return."));
  revalidatePath(`/orders/${orderNumber}`);
  return ok(null, "Return requested. We'll email you with the next steps.");
}

const lookupSchema = z.object({
  orderNumber: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,32}$/, "Enter the order number from your confirmation email."),
  email: z.string().trim().toLowerCase().email("Enter the email used for the order."),
});

/** Guest order lookup: order number plus the email it was placed with. */
export async function lookupOrder(_: unknown, form: FormData): Promise<{ error?: string }> {
  const parsed = lookupSchema.safeParse({ orderNumber: form.get("orderNumber"), email: form.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (!(await rateLimit("lookup", 8, 600))) return { error: "Too many attempts. Please try again in a few minutes." };
  const { data } = await supabaseService()
    .from("orders")
    .select("id, order_number, email")
    .eq("order_number", parsed.data.orderNumber)
    .maybeSingle();
  if (!data || data.email.toLowerCase() !== parsed.data.email) {
    return { error: "We couldn't find an order with that number and email." };
  }
  redirect(orderPath(data.order_number, data.id));
}

/** Customers switch WhatsApp order updates off (or back on) from their order page. */
export async function setWhatsappUpdates(orderNumber: string, key: string | null, on: boolean): Promise<ActionResult<null>> {
  const access = await findAccessibleOrder(orderNumber, key);
  if (!access) return fail("Order not found.");
  if (!(await rateLimit("wa-toggle", 20, 600))) return fail("Too many requests. Please wait a moment.");
  const { error } = await supabaseService().rpc("set_order_whatsapp", { p_order_id: access.id, p_on: !!on });
  if (error) return fail(friendlyError(error));
  revalidatePath(`/orders/${orderNumber}`);
  return ok(null, on ? "WhatsApp updates are on." : "WhatsApp updates are off for this order.");
}
