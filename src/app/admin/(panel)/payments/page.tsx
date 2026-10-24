import Link from "next/link";
import type { Metadata } from "next";
import ReconcileButton from "@/components/admin/orders/ReconcileButton";
import { adminInput, Card, Empty, FilterBar, PageHeader, Pager, pageOf, sp, Stat, Table, Td, Th, withParams } from "@/components/admin/ui";
import { Badge, cx, Notice } from "@/components/ui/controls";
import { requireRole, requireStaffPage } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { razorpayKeys } from "@/lib/payments/razorpay";
import { stripeConfigured } from "@/lib/payments/stripe";

export const metadata: Metadata = { title: "Payments" };

const PAGE_SIZE = 50;
type Params = Record<string, string | string[] | undefined>;
const TONE: Record<string, "green" | "amber" | "red" | "violet" | "neutral"> = { captured: "green", authorized: "amber", created: "neutral", failed: "red", refunded: "violet", partially_refunded: "violet" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireStaffPage("admin");
  const { supabase, store } = await requireRole("admin");
  const razorpayReady = !!(await razorpayKeys(store));
  const params = await searchParams;
  const page = pageOf(params);
  const status = sp(params, "status");
  const provider = sp(params, "provider");
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  let list = supabase
    .from("payments")
    .select("id, provider, provider_order_id, provider_payment_id, amount, amount_refunded, currency, status, method, error_description, captured_at, created_at, order:orders(order_number, email)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (["created", "authorized", "captured", "failed", "refunded", "partially_refunded"].includes(status)) list = list.eq("status", status as "captured");
  if (["razorpay", "stripe", "cod", "manual"].includes(provider)) list = list.eq("provider", provider as "razorpay");

  const [payments, month, refunds, events] = await Promise.all([
    list,
    supabase.from("payments").select("amount, amount_refunded, status").gte("captured_at", monthStart.toISOString()).in("status", ["captured", "partially_refunded", "refunded"]),
    supabase.from("refunds").select("id, amount, status, error, reason, created_at, order:orders(order_number, currency)").in("status", ["pending", "failed"]).order("created_at", { ascending: false }).limit(20),
    supabase.from("payment_events").select("id, provider, event_type, received_at, processed_at, error, order:orders(order_number)").order("received_at", { ascending: false }).limit(15),
  ]);
  const captured = (month.data ?? []).reduce((n, p) => n + p.amount, 0);
  const refunded = (month.data ?? []).reduce((n, p) => n + p.amount_refunded, 0);
  const failedEvents = (events.data ?? []).filter((e) => e.error).length;

  return (
    <>
      <PageHeader
        title="Payments"
        description="Money received through payment providers and cash on delivery. Payments are confirmed with the provider before an order is marked paid."
        actions={<ReconcileButton disabled={!razorpayReady} />}
      />
      {!razorpayReady && (
        <Notice tone="warning" className="mb-4">
          Razorpay keys are not set, so online payments are switched off. Add them in <Link href="/admin/settings?tab=payments" className="underline">Settings › Payment accounts</Link>.
        </Notice>
      )}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Received this month" value={formatMoney(captured)} />
        <Stat label="Refunded this month" value={formatMoney(refunded)} />
        <Stat label="Refunds pending or failed" value={refunds.data?.length ?? 0} tone={refunds.data?.some((r) => r.status === "failed") ? "bad" : "default"} />
        <Stat label="Providers" value={<span className="text-base">{["Razorpay", stripeConfigured(store) && "Stripe", "Cash on delivery"].filter(Boolean).join(" · ")}</span>} hint={razorpayReady ? "Razorpay keys set" : "Razorpay not configured"} />
      </div>

      {(refunds.data ?? []).length > 0 && (
        <Card title="Refunds that need a look" className="mb-5" padded={false}>
          <ul>
            {refunds.data!.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 border-b border-black/5 px-4 py-2.5 text-sm last:border-0">
                <Link href={`/admin/orders/${r.order?.order_number}`} className="font-medium hover:underline">{r.order?.order_number}</Link>
                <span className="tabular-nums">{formatMoney(r.amount, r.order?.currency)}</span>
                <Badge tone={r.status === "failed" ? "red" : "amber"}>{r.status}</Badge>
                <span className="text-xs text-taupe">{r.error || r.reason}</span>
                <span className="ml-auto text-xs text-stone">{formatDateTime(r.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <FilterBar action="/admin/payments">
        <label className="grid gap-1 text-xs text-taupe">
          Status
          <select name="status" defaultValue={status} className={cx(adminInput, "w-44")}>
            <option value="">Any</option>
            <option value="captured">Captured</option>
            <option value="created">Started</option>
            <option value="authorized">Authorised</option>
            <option value="failed">Failed</option>
            <option value="partially_refunded">Partially refunded</option>
            <option value="refunded">Refunded</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs text-taupe">
          Provider
          <select name="provider" defaultValue={provider} className={cx(adminInput, "w-40")}>
            <option value="">Any</option>
            <option value="razorpay">Razorpay</option>
            <option value="stripe">Stripe</option>
            <option value="cod">Cash on delivery</option>
          </select>
        </label>
      </FilterBar>
      {!payments.data?.length ? (
        <Empty title="No payments yet" />
      ) : (
        <Table>
          <thead><tr><Th>Order</Th><Th>Provider</Th><Th>Reference</Th><Th className="text-right">Amount</Th><Th>Status</Th><Th>When</Th></tr></thead>
          <tbody>
            {payments.data.map((p) => (
              <tr key={p.id}>
                <Td><Link href={`/admin/orders/${p.order?.order_number}`} className="font-medium hover:underline">{p.order?.order_number}</Link><span className="block text-xs text-stone">{p.order?.email}</span></Td>
                <Td className="text-taupe">{p.provider}{p.method && <span className="block text-xs">{p.method}</span>}</Td>
                <Td className="max-w-56 font-mono text-xs break-all text-stone">{p.provider_payment_id ?? p.provider_order_id ?? "—"}{p.error_description && <span className="block font-sans text-red-700">{p.error_description}</span>}</Td>
                <Td className="text-right tabular-nums">{formatMoney(p.amount, p.currency)}{p.amount_refunded > 0 && <span className="block text-xs text-violet-700">−{formatMoney(p.amount_refunded, p.currency)}</span>}</Td>
                <Td><Badge tone={TONE[p.status] ?? "neutral"}>{p.status.replace(/_/g, " ")}</Badge></Td>
                <Td className="text-xs whitespace-nowrap text-taupe">{formatDateTime(p.captured_at ?? p.created_at)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager page={page} pageSize={PAGE_SIZE} total={payments.count ?? 0} href={(n) => withParams("/admin/payments", params, { page: n })} />

      <Card title={`Recent webhook events${failedEvents ? ` · ${failedEvents} with errors` : ""}`} className="mt-6" padded={false}>
        {!(events.data ?? []).length ? (
          <p className="px-4 py-6 text-sm text-stone">No webhook events received yet. Add the webhook URL in your Razorpay dashboard (see the README).</p>
        ) : (
          <ul>
            {events.data!.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 border-b border-black/5 px-4 py-2 text-xs last:border-0">
                <span className="font-mono">{e.event_type}</span>
                {e.order?.order_number && <Link href={`/admin/orders/${e.order.order_number}`} className="underline">{e.order.order_number}</Link>}
                {e.error ? <Badge tone="red">{e.error}</Badge> : e.processed_at ? <Badge tone="green">processed</Badge> : <Badge tone="amber">received</Badge>}
                <span className="ml-auto text-stone">{formatDateTime(e.received_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
