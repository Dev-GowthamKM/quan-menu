import Link from "next/link";
import type { Metadata } from "next";
import { adminInput, Empty, FilterBar, PageHeader, Pager, pageOf, sp, Table, Td, Th, withParams } from "@/components/admin/ui";
import { Badge, cx, Notice } from "@/components/ui/controls";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Stock history" };

const PAGE_SIZE = 100;
const REASONS: Record<string, { label: string; tone: "green" | "neutral" | "blue" | "amber" | "red" | "violet" }> = {
  initial: { label: "Initial", tone: "neutral" },
  restock: { label: "Received", tone: "green" },
  adjustment: { label: "Adjustment", tone: "blue" },
  correction: { label: "Correction", tone: "blue" },
  damaged: { label: "Damaged/lost", tone: "amber" },
  sale: { label: "Sale", tone: "violet" },
  cancellation: { label: "Cancellation", tone: "neutral" },
  return: { label: "Return", tone: "green" },
  import: { label: "Import", tone: "blue" },
};

type Params = Record<string, string | string[] | undefined>;

/** Every change to stock: who, when, why and the count afterwards. */
export default async function StockHistory({ searchParams }: { searchParams: Promise<Params> }) {
  const { supabase } = await requireRole("staff");
  const params = await searchParams;
  const page = pageOf(params);
  const sku = sp(params, "sku").trim();
  const reason = sp(params, "reason");
  const from = sp(params, "from");
  const to = sp(params, "to");

  let query = supabase
    .from("inventory_movements")
    .select("id, sku, delta, quantity_after, reason, note, order_id, actor_id, created_at, product:products(id, title)", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (sku) query = query.ilike("sku", `%${sku.replace(/[%_]/g, "")}%`);
  if (reason && reason in REASONS) query = query.eq("reason", reason as "sale");
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) query = query.gte("created_at", `${from}T00:00:00+05:30`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) query = query.lte("created_at", `${to}T23:59:59.999+05:30`);
  const { data, count, error } = await query;

  const actorIds = [...new Set((data ?? []).map((m) => m.actor_id).filter(Boolean))] as string[];
  const orderIds = [...new Set((data ?? []).map((m) => m.order_id).filter(Boolean))] as string[];
  const [actors, orders] = await Promise.all([
    actorIds.length ? supabase.from("profiles").select("id, full_name, email").in("id", actorIds) : Promise.resolve({ data: [] }),
    orderIds.length ? supabase.from("orders").select("id, order_number").in("id", orderIds) : Promise.resolve({ data: [] }),
  ]);
  const actorName = new Map((actors.data ?? []).map((a) => [a.id, a.full_name || a.email || "Staff"]));
  const orderNumber = new Map((orders.data ?? []).map((o) => [o.id, o.order_number]));

  return (
    <>
      <PageHeader title="Stock history" back={{ href: "/admin/inventory", label: "Inventory" }} description="Every stock change, newest first. Sales, cancellations and returns are recorded by orders automatically." />
      {error && <Notice tone="error" className="mb-4">{error.message}</Notice>}
      <FilterBar action="/admin/inventory/history">
        <label className="grid gap-1 text-xs text-taupe">
          SKU
          <input name="sku" defaultValue={sku} className={cx(adminInput, "w-48")} />
        </label>
        <label className="grid gap-1 text-xs text-taupe">
          Reason
          <select name="reason" defaultValue={reason} className={cx(adminInput, "w-40")}>
            <option value="">Any reason</option>
            {Object.entries(REASONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-taupe">
          From
          <input type="date" name="from" defaultValue={from} className={adminInput} />
        </label>
        <label className="grid gap-1 text-xs text-taupe">
          To
          <input type="date" name="to" defaultValue={to} className={adminInput} />
        </label>
      </FilterBar>
      {!data?.length ? (
        <Empty title="No stock changes match" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Product</Th>
              <Th>SKU</Th>
              <Th>Reason</Th>
              <Th className="text-right">Change</Th>
              <Th className="text-right">On hand after</Th>
              <Th>By</Th>
              <Th>Note</Th>
            </tr>
          </thead>
          <tbody>
            {data.map((m) => {
              const r = REASONS[m.reason] ?? { label: m.reason, tone: "neutral" as const };
              return (
                <tr key={m.id}>
                  <Td className="text-xs whitespace-nowrap text-taupe">{formatDateTime(m.created_at)}</Td>
                  <Td>{m.product ? <Link href={`/admin/products/${m.product.id}`} className="hover:underline">{m.product.title}</Link> : <span className="text-stone">Deleted product</span>}</Td>
                  <Td className="font-mono text-xs">{m.sku}</Td>
                  <Td><Badge tone={r.tone}>{r.label}</Badge></Td>
                  <Td className={cx("text-right font-medium tabular-nums", m.delta > 0 ? "text-emerald-700" : "text-red-700")}>{m.delta > 0 ? `+${m.delta}` : `−${Math.abs(m.delta)}`}</Td>
                  <Td className="text-right tabular-nums">{m.quantity_after}</Td>
                  <Td className="text-xs text-taupe">{m.actor_id ? actorName.get(m.actor_id) ?? "Staff" : m.order_id ? "Customer order" : "System"}</Td>
                  <Td className="max-w-72 text-xs text-taupe">
                    {m.order_id && orderNumber.get(m.order_id) ? <Link href={`/admin/orders/${orderNumber.get(m.order_id)}`} className="underline">Order {orderNumber.get(m.order_id)}</Link> : m.note}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <Pager page={page} pageSize={PAGE_SIZE} total={count ?? 0} href={(p) => withParams("/admin/inventory/history", params, { page: p })} />
    </>
  );
}
