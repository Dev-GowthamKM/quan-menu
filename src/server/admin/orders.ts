"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AccessError, requireRole } from "@/lib/auth";
import { sqlNull } from "@/lib/db";
import { processOutbox } from "@/lib/email";
import { fail, friendlyError, ok, type ActionResult } from "@/lib/errors";
import { reconcileRazorpay } from "@/lib/payments/reconcile";
import { executeRefund, type RefundStart } from "@/lib/payments/service";
import type { AppRole } from "@/lib/types";

// Order operations for staff. The database functions enforce the rules (which status
// changes are allowed, who may cancel paid orders, refund limits); these actions check
// the role first for a clear message, then call them with the staff member's session.

async function role(needed: AppRole) {
  try {
    return await requireRole(needed);
  } catch (e) {
    if (e instanceof AccessError) return null;
    throw e;
  }
}

function refresh(orderNumber?: string) {
  revalidatePath("/admin/orders");
  if (orderNumber) revalidatePath(`/admin/orders/${orderNumber}`);
  revalidatePath("/admin");
}

const uuid = z.string().uuid();

export async function setFulfillment(input: {
  orderId: string;
  orderNumber: string;
  status: "processing" | "packed" | "shipped" | "delivered" | "returned";
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  note?: string;
  notify?: boolean;
}): Promise<ActionResult<null>> {
  const ctx = await role("staff");
  if (!ctx) return fail("Staff access required.");
  const parsed = z
    .object({
      orderId: uuid,
      status: z.enum(["processing", "packed", "shipped", "delivered", "returned"]),
      carrier: z.string().trim().max(80).optional(),
      trackingNumber: z.string().trim().max(80).optional(),
      trackingUrl: z.string().trim().max(500).optional(),
      note: z.string().max(2000).optional(),
      notify: z.boolean().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return fail("Check the shipping details.");
  const d = parsed.data;
  const { error } = await ctx.supabase.rpc("admin_set_fulfillment", {
    p_order_id: d.orderId,
    p_status: d.status,
    p_carrier: sqlNull(d.carrier || null),
    p_tracking_number: sqlNull(d.trackingNumber || null),
    p_tracking_url: sqlNull(d.trackingUrl || null),
    p_note: sqlNull(d.note || null),
    p_notify: d.notify ?? true,
  });
  if (error) return fail(friendlyError(error, "The order couldn't be updated."));
  after(() => processOutbox());
  refresh(input.orderNumber);
  return ok(null, d.status === "shipped" ? "Marked as shipped." : d.status === "delivered" ? "Marked as delivered." : "Order updated.");
}

export async function addOrderNote(orderId: string, orderNumber: string, note: string): Promise<ActionResult<null>> {
  const ctx = await role("staff");
  if (!ctx) return fail("Staff access required.");
  if (!uuid.safeParse(orderId).success || !note.trim()) return fail("Write a note first.");
  const { error } = await ctx.supabase.rpc("admin_add_order_note", { p_order_id: orderId, p_note: note.slice(0, 2000) });
  if (error) return fail(friendlyError(error));
  refresh(orderNumber);
  return ok(null, "Note added.");
}

async function startAndSendRefund(sb: NonNullable<Awaited<ReturnType<typeof role>>>["supabase"], orderId: string, amount: number, reason: string, returnRequestId?: string | null) {
  const { data, error } = await sb.rpc("admin_begin_refund", {
    p_order_id: orderId,
    p_amount: amount,
    p_reason: reason.slice(0, 500),
    p_return_request_id: sqlNull(returnRequestId ?? null),
    p_reference: sqlNull<string>(null),
  });
  if (error) return { ok: false, message: friendlyError(error, "The refund couldn't be started.") };
  return executeRefund(data as unknown as RefundStart);
}

/** Cancels an order, returns its stock and, for paid orders, refunds the payment. */
export async function cancelOrderAdmin(input: { orderId: string; orderNumber: string; reason: string; restock: boolean; refund: boolean }): Promise<ActionResult<null>> {
  const ctx = await role("staff");
  if (!ctx) return fail("Staff access required.");
  if (!uuid.safeParse(input.orderId).success) return fail("Unknown order.");
  const { data, error } = await ctx.supabase.rpc("admin_cancel_order", { p_order_id: input.orderId, p_reason: input.reason.slice(0, 300), p_restock: input.restock });
  if (error) return fail(friendlyError(error, "The order couldn't be cancelled."));
  const refundable = Number((data as { refundable?: number } | null)?.refundable ?? 0);
  let message = "Order cancelled.";
  if (refundable > 0 && input.refund) {
    if (ctx.role === "staff") message = "Order cancelled. An admin needs to issue the refund.";
    else {
      const r = await startAndSendRefund(ctx.supabase, input.orderId, refundable, `Order cancelled: ${input.reason}`);
      message = r.ok ? `Order cancelled. ${r.message}` : `Order cancelled, but the refund failed: ${r.message}`;
      if (!r.ok) {
        refresh(input.orderNumber);
        return fail(message);
      }
    }
  }
  after(() => processOutbox());
  refresh(input.orderNumber);
  return ok(null, message);
}

export async function refundOrder(input: { orderId: string; orderNumber: string; amount: number; reason: string; returnRequestId?: string | null }): Promise<ActionResult<null>> {
  const ctx = await role("admin");
  if (!ctx) return fail("Only admins can issue refunds.");
  if (!uuid.safeParse(input.orderId).success) return fail("Unknown order.");
  if (!Number.isInteger(input.amount) || input.amount <= 0) return fail("Enter an amount greater than zero.");
  if (!input.reason.trim()) return fail("Give a reason for the refund (the customer sees it).");
  const r = await startAndSendRefund(ctx.supabase, input.orderId, input.amount, input.reason, input.returnRequestId);
  refresh(input.orderNumber);
  return r.ok ? ok(null, r.message) : fail(r.message);
}

export async function markCodCollected(orderId: string, orderNumber: string, reference: string): Promise<ActionResult<null>> {
  const ctx = await role("admin");
  if (!ctx) return fail("Only admins can record payments.");
  const { error } = await ctx.supabase.rpc("admin_mark_cod_paid", { p_order_id: orderId, p_reference: reference.slice(0, 120) });
  if (error) return fail(friendlyError(error));
  refresh(orderNumber);
  return ok(null, "Payment recorded.");
}

/** Approve, reject, receive or close a return or cancellation request. */
export async function updateReturnRequest(input: {
  requestId: string;
  orderNumber: string;
  action: "approve" | "reject" | "receive" | "close";
  note?: string;
  restock?: boolean;
  refundAmount?: number | null;
}): Promise<ActionResult<{ refundable: number; suggested: number }>> {
  const ctx = await role("staff");
  if (!ctx) return fail("Staff access required.");
  if (!uuid.safeParse(input.requestId).success) return fail("Unknown request.");
  const { data, error } = await ctx.supabase.rpc("admin_update_return", {
    p_request_id: input.requestId,
    p_action: input.action,
    p_note: sqlNull(input.note?.slice(0, 2000) || null),
    p_restock: input.restock ?? true,
  });
  if (error) return fail(friendlyError(error));
  const res = data as unknown as { refundable: number; suggested_refund: number };
  let message = { approve: "Request approved.", reject: "Request rejected.", receive: "Items received.", close: "Request closed." }[input.action];
  if (input.refundAmount && input.refundAmount > 0) {
    if (ctx.role === "staff") message += " An admin needs to issue the refund.";
    else {
      const { data: req } = await ctx.supabase.from("return_requests").select("order_id").eq("id", input.requestId).single();
      if (req) {
        const r = await startAndSendRefund(ctx.supabase, req.order_id, input.refundAmount, "Return refund", input.requestId);
        message += r.ok ? ` ${r.message}` : ` The refund failed: ${r.message}`;
      }
    }
  }
  after(() => processOutbox());
  refresh(input.orderNumber);
  revalidatePath("/admin/returns");
  return ok({ refundable: Number(res.refundable ?? 0), suggested: Number(res.suggested_refund ?? 0) }, message);
}

/** Asks Razorpay about open payment sessions and applies any payment a lost webhook missed. */
export async function reconcilePayments(): Promise<ActionResult<{ checked: number; settled: number; errors: number }>> {
  const ctx = await role("admin");
  if (!ctx) return fail("Only admins can reconcile payments.");
  const result = await reconcileRazorpay(100);
  await ctx.supabase.rpc("log_admin_action", { p_action: "reconcile", p_entity_type: "payments", p_entity_id: sqlNull<string>(null), p_details: result });
  revalidatePath("/admin/payments");
  return ok(result, `Checked ${result.checked} open payment${result.checked === 1 ? "" : "s"}: ${result.settled} settled${result.errors ? `, ${result.errors} errors` : ""}.`);
}

export async function addCustomerNote(customerId: string, body: string): Promise<ActionResult<null>> {
  const ctx = await role("staff");
  if (!ctx) return fail("Staff access required.");
  if (!uuid.safeParse(customerId).success || !body.trim()) return fail("Write a note first.");
  const { error } = await ctx.supabase.from("customer_notes").insert({ customer_id: customerId, body: body.trim().slice(0, 2000), author_id: ctx.user.id });
  if (error) return fail(friendlyError(error));
  revalidatePath(`/admin/customers/${customerId}`);
  return ok(null, "Note saved.");
}

export async function deleteCustomerNote(noteId: string, customerId: string): Promise<ActionResult<null>> {
  const ctx = await role("staff");
  if (!ctx) return fail("Staff access required.");
  const { error } = await ctx.supabase.from("customer_notes").delete().eq("id", noteId);
  if (error) return fail(friendlyError(error));
  revalidatePath(`/admin/customers/${customerId}`);
  return ok(null, "Note deleted.");
}
