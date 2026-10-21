import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// The order list filters, shared by the orders page and the CSV export.

type Params = Record<string, string | string[] | undefined>;
const one = (p: Params, k: string) => {
  const v = p[k];
  return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
};

export const ORDER_VIEWS = [
  { key: "all", label: "All" },
  { key: "pending_payment", label: "Awaiting payment" },
  { key: "to_fulfil", label: "To fulfil" },
  { key: "shipped", label: "Shipped" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "attention", label: "Needs attention" },
  { key: "cod_confirm", label: "COD to confirm" },
] as const;

export const ORDER_COLUMNS =
  "id, order_number, user_id, email, phone, customer_name, status, payment_status, fulfillment_status, payment_method, currency, subtotal, discount_total, shipping_total, cod_fee, tax_total, grand_total, amount_refunded, tax_mode, tax_label, coupon_code, shipping_address, billing_address, shipping_method, customer_note, expires_at, placed_at, paid_at, shipped_at, delivered_at, cancelled_at, cancel_reason, needs_attention, attention_reason, whatsapp_opt_in, cod_confirmation, cod_confirm_by";

export function orderFilters(params: Params) {
  return {
    view: one(params, "view") || "all",
    q: one(params, "q").replace(/[,()%*]/g, " ").trim().slice(0, 80),
    status: one(params, "status"),
    payment: one(params, "payment"),
    fulfillment: one(params, "fulfillment"),
    method: one(params, "method"),
    from: /^\d{4}-\d{2}-\d{2}$/.test(one(params, "from")) ? one(params, "from") : "",
    to: /^\d{4}-\d{2}-\d{2}$/.test(one(params, "to")) ? one(params, "to") : "",
  };
}

type Filters = ReturnType<typeof orderFilters>;

/** Applies the filters to an orders query (PostgREST builder). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyOrderFilters<Q extends { eq: any; in: any; or: any; gte: any; lte: any }>(query: Q, f: Filters): Q {
  let q = query;
  switch (f.view) {
    case "pending_payment": q = q.eq("status", "pending_payment"); break;
    case "to_fulfil": q = q.eq("status", "confirmed").in("fulfillment_status", ["unfulfilled", "processing", "packed"]); break;
    case "shipped": q = q.eq("fulfillment_status", "shipped"); break;
    case "completed": q = q.eq("status", "completed"); break;
    case "cancelled": q = q.eq("status", "cancelled"); break;
    case "attention": q = q.eq("needs_attention", true); break;
    case "cod_confirm": q = q.eq("status", "confirmed").eq("cod_confirmation", "pending"); break;
  }
  if (["pending_payment", "confirmed", "completed", "cancelled"].includes(f.status)) q = q.eq("status", f.status);
  if (["pending", "unpaid", "paid", "partially_refunded", "refunded", "failed", "voided"].includes(f.payment)) q = q.eq("payment_status", f.payment);
  if (["unfulfilled", "processing", "packed", "shipped", "delivered", "returned"].includes(f.fulfillment)) q = q.eq("fulfillment_status", f.fulfillment);
  if (["razorpay", "stripe", "cod"].includes(f.method)) q = q.eq("payment_method", f.method);
  if (f.q) {
    const t = f.q.replace(/\s+/g, " ");
    q = q.or(`order_number.ilike.%${t}%,email.ilike.%${t}%,customer_name.ilike.%${t}%,phone.ilike.%${t}%`);
  }
  if (f.from) q = q.gte("placed_at", `${f.from}T00:00:00+05:30`);
  if (f.to) q = q.lte("placed_at", `${f.to}T23:59:59.999+05:30`);
  return q;
}

export type OrderRow = Database["public"]["Tables"]["orders"]["Row"];

export async function viewCounts(sb: SupabaseClient<Database>) {
  const head = { count: "exact" as const, head: true };
  const [pending, toFulfil, shipped, attention, codConfirm] = await Promise.all([
    sb.from("orders").select("id", head).eq("status", "pending_payment"),
    sb.from("orders").select("id", head).eq("status", "confirmed").in("fulfillment_status", ["unfulfilled", "processing", "packed"]),
    sb.from("orders").select("id", head).eq("fulfillment_status", "shipped"),
    sb.from("orders").select("id", head).eq("needs_attention", true),
    sb.from("orders").select("id", head).eq("status", "confirmed").eq("cod_confirmation", "pending"),
  ]);
  return {
    pending_payment: pending.count ?? 0, to_fulfil: toFulfil.count ?? 0, shipped: shipped.count ?? 0, attention: attention.count ?? 0,
    cod_confirm: codConfirm.count ?? 0,
  } as Record<string, number>;
}
