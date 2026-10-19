import Link from "next/link";
import type { Metadata } from "next";
import { adminInput, Empty, PageHeader, Pager, pageOf, sp, Table, Td, Th, withParams } from "@/components/admin/ui";
import { buttonClass, cx, Notice } from "@/components/ui/controls";
import { DownloadIcon } from "@/components/ui/icons";
import { requireRole, roleAtLeast } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Customers" };

const PAGE_SIZE = 50;
type Params = Record<string, string | string[] | undefined>;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { supabase, role } = await requireRole("staff");
  const params = await searchParams;
  const page = pageOf(params);
  const q = sp(params, "q").slice(0, 100);
  const { data, error } = await supabase.rpc("admin_customers", { p_q: q, p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE });
  const rows = data ?? [];
  const total = Number(rows[0]?.total_count ?? 0);

  return (
    <>
      <PageHeader
        title="Customers"
        description="People with an account. Guest orders are listed under Orders. Lifetime spend counts paid orders minus refunds."
        actions={roleAtLeast(role, "admin") ? <a href={`/admin/customers/export${q ? `?q=${encodeURIComponent(q)}` : ""}`} className={buttonClass("ghost", "sm", "border-black/15! bg-white")}><DownloadIcon size={14} /> Export CSV</a> : undefined}
      />
      {error && <Notice tone="error" className="mb-4">{error.message}</Notice>}
      <form action="/admin/customers" className="mb-4 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Name, email or phone" aria-label="Search customers" className={cx(adminInput, "w-72")} />
        <button className="h-9 rounded-md bg-ink px-4 text-sm text-white">Search</button>
      </form>
      {!rows.length ? (
        <Empty title={q ? "No customers match" : "No customers yet"}>Customers appear here when they create an account.</Empty>
      ) : (
        <Table>
          <thead><tr><Th>Customer</Th><Th>Phone</Th><Th className="text-right">Orders</Th><Th className="text-right">Lifetime spend</Th><Th>Last order</Th><Th>Joined</Th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <Td><Link href={`/admin/customers/${c.id}`} className="font-medium hover:underline">{c.full_name || c.email}</Link>{c.full_name && <span className="block text-xs text-stone">{c.email}</span>}</Td>
                <Td className="text-taupe">{c.phone || "—"}</Td>
                <Td className="text-right tabular-nums">{c.orders_count}</Td>
                <Td className="text-right tabular-nums">{formatMoney(c.lifetime_spend)}</Td>
                <Td className="text-xs text-taupe">{c.last_order_at ? formatDate(c.last_order_at) : "—"}</Td>
                <Td className="text-xs text-taupe">{formatDate(c.created_at)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager page={page} pageSize={PAGE_SIZE} total={total} href={(p) => withParams("/admin/customers", params, { page: p })} />
    </>
  );
}
