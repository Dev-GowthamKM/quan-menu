import Link from "next/link";
import type { Metadata } from "next";
import { Empty, PageHeader, Pager, pageOf, sp, Table, Td, Th, withParams } from "@/components/admin/ui";
import { Badge, cx, Notice } from "@/components/ui/controls";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Returns" };

const PAGE_SIZE = 50;
const TONE: Record<string, "amber" | "blue" | "red" | "green" | "neutral" | "violet"> = {
  requested: "amber", approved: "blue", rejected: "red", received: "violet", refunded: "green", closed: "neutral",
};
const VIEWS = [
  { key: "open", label: "Open", statuses: ["requested", "approved", "received"] },
  { key: "requested", label: "New", statuses: ["requested"] },
  { key: "done", label: "Resolved", statuses: ["rejected", "refunded", "closed"] },
  { key: "all", label: "All", statuses: [] as string[] },
];

type Params = Record<string, string | string[] | undefined>;

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { supabase } = await requireRole("staff");
  const params = await searchParams;
  const page = pageOf(params);
  const view = VIEWS.find((v) => v.key === sp(params, "view")) ?? VIEWS[0];
  let q = supabase
    .from("return_requests")
    .select("id, kind, status, reason, created_at, refund_amount, order:orders(order_number, customer_name, email, currency), items:return_request_items(quantity)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (view.statuses.length) q = q.in("status", view.statuses as ("requested" | "approved")[]);
  const { data, count, error } = await q;

  return (
    <>
      <PageHeader title="Returns and cancellations" description="Requests from customers. Open one to approve it, record the items coming back and refund." />
      {error && <Notice tone="error" className="mb-4">{error.message}</Notice>}
      <nav aria-label="Return views" className="mb-4 flex gap-1 border-b border-black/10">
        {VIEWS.map((v) => (
          <Link key={v.key} href={v.key === "open" ? "/admin/returns" : `/admin/returns?view=${v.key}`} aria-current={v.key === view.key ? "page" : undefined}
            className={cx("-mb-px border-b-2 px-3 py-2 text-sm", v.key === view.key ? "border-ink font-medium" : "border-transparent text-taupe hover:text-ink")}>{v.label}</Link>
        ))}
      </nav>
      {!data?.length ? (
        <Empty title="Nothing here">Customers can ask to cancel or return from their order page.</Empty>
      ) : (
        <Table>
          <thead><tr><Th>Order</Th><Th>Type</Th><Th>Status</Th><Th>Reason</Th><Th className="text-right">Items</Th><Th>Requested</Th></tr></thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id}>
                <Td>
                  <Link href={`/admin/orders/${r.order?.order_number}`} className="font-medium hover:underline">{r.order?.order_number}</Link>
                  <span className="block text-xs text-stone">{r.order?.customer_name || r.order?.email}</span>
                </Td>
                <Td>{r.kind === "return" ? "Return" : "Cancellation"}</Td>
                <Td><Badge tone={TONE[r.status]}>{r.status}</Badge></Td>
                <Td className="max-w-80 text-taupe">{r.reason}</Td>
                <Td className="text-right tabular-nums">{(r.items ?? []).reduce((n, i) => n + i.quantity, 0) || "All"}</Td>
                <Td className="text-xs whitespace-nowrap text-taupe">{formatDateTime(r.created_at)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager page={page} pageSize={PAGE_SIZE} total={count ?? 0} href={(p) => withParams("/admin/returns", params, { page: p })} />
    </>
  );
}
