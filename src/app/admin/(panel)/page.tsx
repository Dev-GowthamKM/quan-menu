import Link from "next/link";
import RevenueChart from "@/components/admin/RevenueChart";
import { Card, Empty, OrderBadges, PageHeader, Stat, Table, Td, Th } from "@/components/admin/ui";
import CatalogImage from "@/components/ui/CatalogImage";
import { Notice } from "@/components/ui/controls";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { FulfillmentStatus, OrderStatus, PaymentStatus } from "@/lib/types";

interface Dashboard {
  currency: string;
  revenue: { total: number; today: number; month: number; refunded_total: number; cod_outstanding: number };
  orders: {
    total: number; today: number; awaiting_payment: number; to_fulfil: number; awaiting_shipment: number; in_transit: number;
    completed: number; cancelled: number; needs_attention: number; open_requests: number;
  };
  customers: { registered: number; buyers: number; new_this_month: number };
  inventory: { low_stock: number; out_of_stock: number; items: { variant_id: string; product_id: string; title: string; sku: string; variant: string; available: number; threshold: number }[] };
  best_sellers: { product_id: string; title: string; units: number; revenue: number; image_url: string | null }[];
  trend: { date: string; revenue: number; orders: number }[];
  recent_orders: {
    id: string; order_number: string; customer_name: string; email: string; grand_total: number; currency: string;
    status: OrderStatus; payment_status: PaymentStatus; fulfillment_status: FulfillmentStatus; placed_at: string;
  }[];
}

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { supabase } = await requireRole("staff");
  const { denied } = await searchParams;
  const { data, error } = await supabase.rpc("admin_dashboard", { p_days: 30 });
  if (error || !data) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Notice tone="error">The dashboard couldn&apos;t load: {error?.message ?? "no data"}. Have all migrations been applied?</Notice>
      </>
    );
  }
  const d = data as unknown as Dashboard;
  const c = d.currency;

  return (
    <>
      <PageHeader title="Dashboard" description="All figures come from live orders and payments. Revenue counts only money a payment provider confirmed, minus refunds." />
      {denied && <Notice tone="warning" className="mb-4">You don&apos;t have access to that page.</Notice>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Net revenue received" value={formatMoney(d.revenue.total, c)} hint={d.revenue.refunded_total ? `${formatMoney(d.revenue.refunded_total, c)} refunded in total` : "All time"} />
        <Stat label="Revenue today" value={formatMoney(d.revenue.today, c)} hint={`${d.orders.today} ${d.orders.today === 1 ? "order" : "orders"} today`} />
        <Stat label="Revenue this month" value={formatMoney(d.revenue.month, c)} />
        <Stat label="Total orders" value={d.orders.total.toLocaleString("en-IN")} hint="Placed orders, excluding unpaid expiries" />
        <Stat label="Customers" value={d.customers.registered.toLocaleString("en-IN")} hint={`${d.customers.buyers} have bought · ${d.customers.new_this_month} new this month`} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Link href="/admin/orders?status=pending_payment"><Stat label="Awaiting payment" value={d.orders.awaiting_payment} tone={d.orders.awaiting_payment ? "warn" : "default"} /></Link>
        <Link href="/admin/orders?fulfillment=unfulfilled&status=confirmed"><Stat label="To fulfil" value={d.orders.to_fulfil} tone={d.orders.to_fulfil ? "warn" : "default"} /></Link>
        <Link href="/admin/orders?fulfillment=packed"><Stat label="Awaiting shipment" value={d.orders.awaiting_shipment} /></Link>
        <Link href="/admin/orders?fulfillment=shipped"><Stat label="In transit" value={d.orders.in_transit} /></Link>
        <Link href="/admin/orders?status=completed"><Stat label="Completed" value={d.orders.completed} tone="good" /></Link>
        <Link href="/admin/orders?status=cancelled"><Stat label="Cancelled" value={d.orders.cancelled} /></Link>
        <Link href="/admin/orders?attention=1"><Stat label="Needs attention" value={d.orders.needs_attention} tone={d.orders.needs_attention ? "bad" : "default"} /></Link>
        <Link href="/admin/returns"><Stat label="Open returns" value={d.orders.open_requests} tone={d.orders.open_requests ? "warn" : "default"} /></Link>
      </div>
      {d.revenue.cod_outstanding > 0 && (
        <p className="mt-3 text-xs text-taupe">
          Cash on delivery still to collect: <b>{formatMoney(d.revenue.cod_outstanding, c)}</b> (not counted as revenue until marked collected).
        </p>
      )}

      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title="Net revenue, last 30 days">
          <RevenueChart data={d.trend} currency={c} />
        </Card>
        <Card
          title={`Low stock (${d.inventory.low_stock} low, ${d.inventory.out_of_stock} out)`}
          actions={<Link href="/admin/inventory?filter=low" className="text-xs underline">Inventory</Link>}
          padded={false}
        >
          {d.inventory.items.length ? (
            <ul className="divide-y divide-black/5 text-sm">
              {d.inventory.items.map((i) => (
                <li key={i.variant_id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <Link href={`/admin/products/${i.product_id}`} className="min-w-0 hover:underline">
                    <span className="block truncate">{i.title}</span>
                    <span className="block text-xs text-stone">{i.sku}{i.variant ? ` · ${i.variant}` : ""}</span>
                  </Link>
                  <span className={i.available <= 0 ? "text-red-700" : "text-amber-700"}>{i.available <= 0 ? "Out" : `${i.available} left`}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-sm text-taupe">Everything is above its threshold.</p>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card title="Best sellers, last 30 days" padded={false}>
          {d.best_sellers.length ? (
            <ol className="divide-y divide-black/5 text-sm">
              {d.best_sellers.map((b, i) => (
                <li key={b.product_id ?? i} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-4 text-xs text-stone">{i + 1}</span>
                  <span className="relative size-10 shrink-0 overflow-hidden rounded bg-bone">
                    <CatalogImage src={b.image_url} alt="" fill sizes="40px" className="object-cover" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{b.title}</span>
                  <span className="text-right text-xs text-taupe tabular-nums">{b.units} sold<br />{formatMoney(b.revenue, c)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="p-4 text-sm text-taupe">No sales in the last 30 days yet.</p>
          )}
        </Card>
        <Card title="Recent orders" actions={<Link href="/admin/orders" className="text-xs underline">All orders</Link>} padded={false}>
          {d.recent_orders.length ? (
            <Table className="rounded-none border-0">
              <thead>
                <tr><Th>Order</Th><Th>Customer</Th><Th>Status</Th><Th className="text-right">Total</Th><Th>Placed</Th></tr>
              </thead>
              <tbody>
                {d.recent_orders.map((o) => (
                  <tr key={o.id} className="hover:bg-black/[0.02]">
                    <Td><Link href={`/admin/orders/${o.id}`} className="font-medium hover:underline">{o.order_number}</Link></Td>
                    <Td><span className="block max-w-48 truncate">{o.customer_name || o.email}</span></Td>
                    <Td><OrderBadges status={o.status} payment={o.payment_status} fulfillment={o.fulfillment_status} /></Td>
                    <Td className="text-right tabular-nums">{formatMoney(o.grand_total, o.currency)}</Td>
                    <Td className="whitespace-nowrap text-taupe">{formatDateTime(o.placed_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <div className="p-4"><Empty title="No orders yet">Orders will appear here as soon as customers check out.</Empty></div>
          )}
        </Card>
      </div>
    </>
  );
}
