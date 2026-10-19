import Link from "next/link";
import type { Metadata } from "next";
import { adminInput, Empty, FilterBar, OrderBadges, PageHeader, Pager, pageOf, Table, Td, Th, withParams } from "@/components/admin/ui";
import { Badge, buttonClass, cx, Notice } from "@/components/ui/controls";
import { AlertIcon, DownloadIcon } from "@/components/ui/icons";
import { applyOrderFilters, ORDER_COLUMNS, ORDER_VIEWS, orderFilters, viewCounts } from "@/lib/admin-orders";
import { requireRole, roleAtLeast } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Orders" };

const PAGE_SIZE = 50;
type Params = Record<string, string | string[] | undefined>;
const METHOD: Record<string, string> = { razorpay: "Razorpay", stripe: "Card (Stripe)", cod: "Cash on delivery", none: "No payment" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { supabase, role } = await requireRole("staff");
  const params = await searchParams;
  const page = pageOf(params);
  const f = orderFilters(params);
  const query = applyOrderFilters(
    supabase.from("orders").select(`${ORDER_COLUMNS}, items:order_items(quantity)`, { count: "exact" }),
    f,
  )
    .order("placed_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const [{ data, count, error }, counts] = await Promise.all([query, viewCounts(supabase)]);
  const exportQuery = new URLSearchParams(Object.entries(f).filter(([, v]) => v && v !== "all") as [string, string][]).toString();

  return (
    <>
      <PageHeader
        title="Orders"
        description="Every order placed in the store. Unpaid online orders hold their stock until payment arrives or the hold expires."
        actions={roleAtLeast(role, "admin") ? <a href={`/admin/orders/export${exportQuery ? `?${exportQuery}` : ""}`} className={buttonClass("ghost", "sm", "border-black/15! bg-white")}><DownloadIcon size={14} /> Export CSV</a> : undefined}
      />
      {error && <Notice tone="error" className="mb-4">{error.message}</Notice>}
      <nav aria-label="Order views" className="relative mb-3 flex gap-1 overflow-x-auto border-b border-black/10">
        {ORDER_VIEWS.map((v) => {
          const active = f.view === v.key && !f.status && !f.fulfillment && !f.payment;
          const n = counts[v.key];
          return (
            <Link key={v.key} href={v.key === "all" ? "/admin/orders" : `/admin/orders?view=${v.key}`} aria-current={active ? "page" : undefined}
              className={cx("-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap", active ? "border-ink font-medium" : "border-transparent text-taupe hover:text-ink")}>
              {v.label}
              {n ? <span className={cx("ml-1.5 rounded-full px-1.5 text-[11px] tabular-nums", v.key === "attention" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900")}>{n}</span> : null}
            </Link>
          );
        })}
      </nav>
      <FilterBar action="/admin/orders">
        {f.view !== "all" && <input type="hidden" name="view" value={f.view} />}
        <label className="grid gap-1 text-xs text-taupe">
          Search
          <input name="q" defaultValue={f.q} placeholder="Order number, name, email, phone" className={cx(adminInput, "w-64")} />
        </label>
        <label className="grid gap-1 text-xs text-taupe">
          Payment
          <select name="payment" defaultValue={f.payment} className={cx(adminInput, "w-40")}>
            <option value="">Any</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="unpaid">Pay on delivery</option>
            <option value="partially_refunded">Partially refunded</option>
            <option value="refunded">Refunded</option>
            <option value="failed">Failed</option>
            <option value="voided">Not charged</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs text-taupe">
          Fulfilment
          <select name="fulfillment" defaultValue={f.fulfillment} className={cx(adminInput, "w-36")}>
            <option value="">Any</option>
            <option value="unfulfilled">Not packed</option>
            <option value="processing">Preparing</option>
            <option value="packed">Packed</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="returned">Returned</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs text-taupe">
          Method
          <select name="method" defaultValue={f.method} className={cx(adminInput, "w-36")}>
            <option value="">Any</option>
            <option value="razorpay">Razorpay</option>
            <option value="cod">Cash on delivery</option>
            <option value="stripe">Stripe</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs text-taupe">From<input type="date" name="from" defaultValue={f.from} className={adminInput} /></label>
        <label className="grid gap-1 text-xs text-taupe">To<input type="date" name="to" defaultValue={f.to} className={adminInput} /></label>
      </FilterBar>

      {!data?.length ? (
        <Empty title="No orders match">Orders appear here as soon as a customer checks out.</Empty>
      ) : (
        <Table>
          <thead>
            <tr><Th>Order</Th><Th>Placed</Th><Th>Customer</Th><Th className="text-right">Items</Th><Th className="text-right">Total</Th><Th>Status</Th><Th>Method</Th></tr>
          </thead>
          <tbody>
            {data.map((o) => {
              const items = (o.items ?? []).reduce((n, i) => n + i.quantity, 0);
              return (
                <tr key={o.id} className="hover:bg-black/[0.015]">
                  <Td>
                    <Link href={`/admin/orders/${o.order_number}`} className="font-medium hover:underline">{o.order_number}</Link>
                    {o.needs_attention && <span className="ml-2 inline-flex items-center gap-1 text-xs text-red-700" title={o.attention_reason ?? ""}><AlertIcon size={12} /> Check</span>}
                  </Td>
                  <Td className="text-xs whitespace-nowrap text-taupe">{formatDateTime(o.placed_at)}</Td>
                  <Td>
                    <span className="block">{o.customer_name || "—"}</span>
                    <span className="text-xs text-stone">{o.email}{!o.user_id && " · guest"}</span>
                  </Td>
                  <Td className="text-right tabular-nums">{items}</Td>
                  <Td className="text-right whitespace-nowrap tabular-nums">
                    {formatMoney(o.grand_total, o.currency)}
                    {o.amount_refunded > 0 && <span className="block text-xs text-violet-700">−{formatMoney(o.amount_refunded, o.currency)} refunded</span>}
                  </Td>
                  <Td><OrderBadges status={o.status} payment={o.payment_status} fulfillment={o.fulfillment_status} /></Td>
                  <Td className="text-xs text-taupe">{METHOD[o.payment_method] ?? o.payment_method}{o.coupon_code && <Badge className="ml-1">{o.coupon_code}</Badge>}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <Pager page={page} pageSize={PAGE_SIZE} total={count ?? 0} href={(p) => withParams("/admin/orders", params, { page: p })} />
    </>
  );
}
