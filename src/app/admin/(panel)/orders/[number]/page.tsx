import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CancelPanel, FulfillmentPanel, NotePanel, PaymentPanel, ReturnPanel, type ReturnRequestView } from "@/components/admin/orders/OrderPanels";
import { Card, OrderBadges } from "@/components/admin/ui";
import CatalogImage from "@/components/ui/CatalogImage";
import { Badge, buttonClass, cx, Notice } from "@/components/ui/controls";
import { AlertIcon, PrintIcon } from "@/components/ui/icons";
import { ORDER_COLUMNS } from "@/lib/admin-orders";
import { requireRole, roleAtLeast } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Order" };

interface Address {
  full_name?: string; phone?: string; line1?: string; line2?: string; landmark?: string; city?: string; state?: string; postal_code?: string; country?: string;
}

function AddressBlock({ a }: { a: Address | null }) {
  if (!a) return <p className="text-sm text-stone">Same as shipping</p>;
  return (
    <address className="text-sm leading-relaxed not-italic">
      {a.full_name}<br />
      {a.line1}{a.line2 ? <>, {a.line2}</> : null}<br />
      {a.landmark && <>{a.landmark}<br /></>}
      {a.city}, {a.state} {a.postal_code}<br />
      {a.phone && <span className="text-taupe">{a.phone}</span>}
    </address>
  );
}

const EVENT_TONE: Record<string, string> = {
  payment_captured: "bg-emerald-500", placed: "bg-ink", cancelled: "bg-red-500", payment_failed: "bg-red-500", refund_started: "bg-violet-500",
  refund_processed: "bg-violet-500", note: "bg-amber-500", fulfillment: "bg-sky-500",
};

export default async function AdminOrder({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const { supabase, role } = await requireRole("staff");
  const isAdmin = roleAtLeast(role, "admin");
  const { data: order } = await supabase.from("orders").select(ORDER_COLUMNS).eq("order_number", number.toUpperCase()).maybeSingle();
  if (!order) notFound();

  const [items, events, shipments, returns, providers, payments, refunds, customer] = await Promise.all([
    supabase.from("order_items").select("*").eq("order_id", order.id).order("created_at"),
    supabase.from("order_events").select("id, kind, message, is_internal, actor_type, created_at").eq("order_id", order.id).order("created_at", { ascending: false }).order("id", { ascending: false }),
    supabase.from("shipments").select("*").eq("order_id", order.id).order("created_at", { ascending: false }),
    supabase.from("return_requests").select("id, kind, status, reason, details, admin_note, created_at, items:return_request_items(quantity, order_item_id)").eq("order_id", order.id).order("created_at", { ascending: false }),
    supabase.from("shipping_providers").select("name, tracking_url_template").eq("is_active", true).order("name"),
    isAdmin ? supabase.from("payments").select("id, provider, provider_order_id, provider_payment_id, amount, amount_refunded, status, method, error_description, captured_at, created_at").eq("order_id", order.id).order("created_at") : Promise.resolve({ data: null }),
    isAdmin ? supabase.from("refunds").select("id, amount, status, reason, error, provider_refund_id, created_at, processed_at").eq("order_id", order.id).order("created_at") : Promise.resolve({ data: null }),
    order.user_id ? supabase.from("orders").select("id", { count: "exact", head: true }).eq("user_id", order.user_id).neq("status", "cancelled") : Promise.resolve({ count: null }),
  ]);

  const c = order.currency;
  const ship = order.shipping_address as Address;
  const bill = order.billing_address as Address | null;
  const method = order.shipping_method as { name?: string; min_days?: number; max_days?: number } | null;
  const lines = items.data ?? [];
  const latestShipment = shipments.data?.[0];
  const captured = (payments.data ?? []).filter((p) => ["captured", "partially_refunded", "refunded"].includes(p.status));
  const refundable = captured.reduce((n, p) => n + p.amount - p.amount_refunded, 0) - (refunds.data ?? []).filter((r) => r.status === "pending").reduce((n, r) => n + r.amount, 0);
  const returnViews: ReturnRequestView[] = (returns.data ?? []).map((r) => ({
    id: r.id, kind: r.kind, status: r.status, reason: r.reason, details: r.details, admin_note: r.admin_note, created_at: r.created_at,
    items: (r.items ?? []).map((it) => {
      const li = lines.find((l) => l.id === it.order_item_id);
      return { quantity: it.quantity, title: li ? `${li.product_title}${li.variant_title ? ` (${li.variant_title})` : ""}` : "Item", value: li ? Math.round((li.line_total / li.quantity) * it.quantity) : 0 };
    }),
  }));

  return (
    <div className="pb-16">
      <div className="mb-6">
        <Link href="/admin/orders" className="text-sm text-taupe hover:text-ink">← Orders</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{order.order_number}</h1>
          <OrderBadges status={order.status} payment={order.payment_status} fulfillment={order.fulfillment_status} />
          <div className="ml-auto flex gap-2">
            <a href={`/admin/print/packing-slip/${order.order_number}`} target="_blank" rel="noreferrer" className={buttonClass("ghost", "sm", "border-black/15! bg-white")}><PrintIcon size={14} /> Packing slip</a>
            <a href={`/admin/print/invoice/${order.order_number}`} target="_blank" rel="noreferrer" className={buttonClass("ghost", "sm", "border-black/15! bg-white")}><PrintIcon size={14} /> Invoice</a>
          </div>
        </div>
        <p className="mt-1 text-sm text-taupe">Placed {formatDateTime(order.placed_at)}{order.paid_at && ` · paid ${formatDateTime(order.paid_at)}`}</p>
      </div>

      {order.needs_attention && (
        <Notice tone="warning" className="mb-5 flex items-start gap-2"><AlertIcon size={16} className="mt-0.5 shrink-0" /> {order.attention_reason || "This order needs a look."}</Notice>
      )}
      {order.status === "pending_payment" && order.expires_at && (
        <Notice className="mb-5">Waiting for payment. The stock it holds is released at {formatDateTime(order.expires_at)} if no payment arrives.</Notice>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 content-start gap-5">
          <Card title={`Items (${lines.reduce((n, l) => n + l.quantity, 0)})`} padded={false}>
            <ul>
              {lines.map((l) => (
                <li key={l.id} className="flex gap-3 border-b border-black/5 px-4 py-3 last:border-0">
                  <div className="relative size-14 shrink-0 overflow-hidden rounded bg-bone">{l.image_url && <CatalogImage src={l.image_url} alt="" fill sizes="56px" className="object-cover" />}</div>
                  <div className="min-w-0 flex-1 text-sm">
                    {l.product_id ? <Link href={`/admin/products/${l.product_id}`} className="font-medium hover:underline">{l.product_title}</Link> : <span className="font-medium">{l.product_title}</span>}
                    <p className="text-xs text-taupe">{[l.color, l.size].filter(Boolean).join(" / ")}{l.brand_name && ` · ${l.brand_name}`}</p>
                    <p className="font-mono text-xs text-stone">{l.sku}</p>
                    {l.quantity_returned > 0 && <Badge tone="red" className="mt-1">{l.quantity_returned} returned</Badge>}
                    {!l.is_returnable && <span className="ml-1 text-xs text-stone">Final sale</span>}
                  </div>
                  <div className="text-right text-sm whitespace-nowrap tabular-nums">
                    <p>{formatMoney(l.unit_price, c)} × {l.quantity}</p>
                    {l.discount_amount > 0 && <p className="text-xs text-emerald-700">−{formatMoney(l.discount_amount, c)}</p>}
                    <p className="font-medium">{formatMoney(l.line_total, c)}</p>
                    <p className="text-xs text-stone">{order.tax_label} {l.tax_rate_bps / 100}%: {formatMoney(l.tax_amount, c)}</p>
                  </div>
                </li>
              ))}
            </ul>
            <dl className="grid gap-1.5 border-t border-black/10 px-4 py-3 text-sm">
              <div className="flex justify-between"><dt className="text-taupe">Subtotal</dt><dd className="tabular-nums">{formatMoney(order.subtotal, c)}</dd></div>
              {order.discount_total > 0 && <div className="flex justify-between"><dt className="text-taupe">Discount{order.coupon_code && ` (${order.coupon_code})`}</dt><dd className="text-emerald-700 tabular-nums">−{formatMoney(order.discount_total, c)}</dd></div>}
              <div className="flex justify-between"><dt className="text-taupe">Shipping{method?.name && ` · ${method.name}`}</dt><dd className="tabular-nums">{order.shipping_total ? formatMoney(order.shipping_total, c) : "Free"}</dd></div>
              {order.cod_fee > 0 && <div className="flex justify-between"><dt className="text-taupe">Cash on delivery fee</dt><dd className="tabular-nums">{formatMoney(order.cod_fee, c)}</dd></div>}
              <div className="flex justify-between"><dt className="text-taupe">{order.tax_label} {order.tax_mode === "inclusive" ? "(included)" : order.tax_mode === "exclusive" ? "" : "(none)"}</dt><dd className="tabular-nums">{formatMoney(order.tax_total, c)}</dd></div>
              <div className="flex justify-between border-t border-black/10 pt-1.5 font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatMoney(order.grand_total, c)}</dd></div>
              {order.amount_refunded > 0 && (
                <>
                  <div className="flex justify-between text-violet-700"><dt>Refunded</dt><dd className="tabular-nums">−{formatMoney(order.amount_refunded, c)}</dd></div>
                  <div className="flex justify-between font-medium"><dt>Net</dt><dd className="tabular-nums">{formatMoney(order.grand_total - order.amount_refunded, c)}</dd></div>
                </>
              )}
            </dl>
          </Card>

          <FulfillmentPanel
            orderId={order.id}
            orderNumber={order.order_number}
            status={order.status}
            fulfillment={order.fulfillment_status}
            providers={providers.data ?? []}
            shipment={latestShipment ? { carrier: latestShipment.carrier, tracking_number: latestShipment.tracking_number, tracking_url: latestShipment.tracking_url, shipped_at: latestShipment.shipped_at, delivered_at: latestShipment.delivered_at } : null}
          />

          {returnViews.length > 0 && <ReturnPanel requests={returnViews} orderId={order.id} orderNumber={order.order_number} isAdmin={isAdmin} currency={c} refundable={refundable} />}

          <Card title="Timeline">
            <NotePanel orderId={order.id} orderNumber={order.order_number} />
            <ol className="mt-4 grid gap-3">
              {(events.data ?? []).map((e) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", EVENT_TONE[e.kind] ?? "bg-black/25")} />
                  <div className="min-w-0 flex-1">
                    <p className={cx(e.is_internal && "rounded bg-amber-50 px-2 py-1")}>{e.message || e.kind.replace(/_/g, " ")}</p>
                    <p className="text-xs text-stone">{formatDateTime(e.created_at)} · {e.is_internal ? "Internal note" : e.actor_type === "customer" ? "Customer" : e.actor_type === "staff" ? "Staff" : e.actor_type === "provider" ? "Payment provider" : "System"}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="grid min-w-0 content-start gap-5">
          <Card title="Customer">
            <p className="text-sm font-medium">{order.customer_name || "—"}</p>
            <p className="text-sm"><a href={`mailto:${order.email}`} className="underline">{order.email}</a></p>
            {order.phone && <p className="text-sm"><a href={`tel:${order.phone}`} className="underline">{order.phone}</a></p>}
            <p className="mt-2 text-xs text-stone">
              {order.user_id ? (
                <Link href={`/admin/customers/${order.user_id}`} className="underline">Customer account · {customer.count ?? 0} {customer.count === 1 ? "order" : "orders"}</Link>
              ) : "Guest checkout"}
            </p>
            {order.customer_note && <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-sm"><span className="block text-xs font-medium text-amber-900">Note from customer</span>{order.customer_note}</p>}
          </Card>
          <Card title="Shipping address"><AddressBlock a={ship} />{method?.name && <p className="mt-2 text-xs text-stone">{method.name}{method.min_days ? ` · ${method.min_days}–${method.max_days} days` : ""}</p>}</Card>
          <Card title="Billing address"><AddressBlock a={bill} /></Card>
          <PaymentPanel
            orderId={order.id}
            orderNumber={order.order_number}
            isAdmin={isAdmin}
            method={order.payment_method}
            paymentStatus={order.payment_status}
            orderStatus={order.status}
            currency={c}
            refundable={Math.max(refundable, 0)}
            payments={payments.data ?? null}
            refunds={refunds.data ?? null}
          />
          {order.status !== "cancelled" && order.fulfillment_status !== "delivered" && (
            <CancelPanel orderId={order.id} orderNumber={order.order_number} paid={["paid", "partially_refunded"].includes(order.payment_status)} isAdmin={isAdmin} shipped={["shipped", "delivered"].includes(order.fulfillment_status)} />
          )}
          {order.status === "cancelled" && <Card title="Cancelled"><p className="text-sm">{formatDateTime(order.cancelled_at)}</p>{order.cancel_reason && <p className="mt-1 text-sm text-taupe">{order.cancel_reason}</p>}</Card>}
        </div>
      </div>
    </div>
  );
}
