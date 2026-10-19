import { applyOrderFilters, orderFilters } from "@/lib/admin-orders";
import { AccessError, requireRole } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import type { Json } from "@/lib/database.types";
import { sqlNull } from "@/lib/db";
import { fromMinor } from "@/lib/money";

export const dynamic = "force-dynamic";

const HEADER = [
  "order_number", "placed_at", "status", "payment_status", "fulfillment_status", "payment_method", "customer_name", "email", "phone",
  "city", "state", "postal_code", "items", "subtotal", "discount", "coupon", "shipping", "cod_fee", "tax", "total", "refunded", "currency",
  "paid_at", "shipped_at", "delivered_at", "cancelled_at",
];

/** Orders matching the list filters as CSV. Admins only, and every export is written to the audit log. */
export async function GET(req: Request) {
  let ctx;
  try {
    ctx = await requireRole("admin");
  } catch (e) {
    if (e instanceof AccessError) return new Response(e.message, { status: 403 });
    throw e;
  }
  const f = orderFilters(Object.fromEntries(new URL(req.url).searchParams));
  const rows: unknown[][] = [HEADER];
  const PAGE = 1000;
  for (let from = 0; from < 50_000; from += PAGE) {
    const { data, error } = await applyOrderFilters(
      ctx.supabase
        .from("orders")
        .select("order_number, placed_at, status, payment_status, fulfillment_status, payment_method, customer_name, email, phone, shipping_address, subtotal, discount_total, coupon_code, shipping_total, cod_fee, tax_total, grand_total, amount_refunded, currency, paid_at, shipped_at, delivered_at, cancelled_at, items:order_items(quantity)"),
      f,
    )
      .order("placed_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) return new Response(error.message, { status: 500 });
    for (const o of data ?? []) {
      const a = (o.shipping_address ?? {}) as { city?: string; state?: string; postal_code?: string };
      rows.push([
        o.order_number, o.placed_at, o.status, o.payment_status, o.fulfillment_status, o.payment_method, o.customer_name, o.email, o.phone,
        a.city ?? "", a.state ?? "", a.postal_code ?? "", (o.items ?? []).reduce((n, i) => n + i.quantity, 0),
        fromMinor(o.subtotal), fromMinor(o.discount_total), o.coupon_code ?? "", fromMinor(o.shipping_total), fromMinor(o.cod_fee),
        fromMinor(o.tax_total), fromMinor(o.grand_total), fromMinor(o.amount_refunded), o.currency,
        o.paid_at ?? "", o.shipped_at ?? "", o.delivered_at ?? "", o.cancelled_at ?? "",
      ]);
    }
    if ((data ?? []).length < PAGE) break;
  }
  await ctx.supabase.rpc("log_admin_action", { p_action: "export", p_entity_type: "orders", p_entity_id: sqlNull<string>(null), p_details: { count: rows.length - 1, filters: f } as Json });
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
