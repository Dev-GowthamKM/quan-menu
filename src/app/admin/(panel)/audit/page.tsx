import type { Metadata } from "next";
import { adminInput, Empty, FilterBar, PageHeader, Pager, pageOf, sp, Table, Td, Th, withParams } from "@/components/admin/ui";
import { cx, Notice } from "@/components/ui/controls";
import { requireRole, requireStaffPage } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Audit log" };

const PAGE_SIZE = 100;
type Params = Record<string, string | string[] | undefined>;

function summarize(changes: unknown) {
  if (!changes || typeof changes !== "object") return "";
  const entries = Object.entries(changes as Record<string, unknown>);
  return entries
    .slice(0, 6)
    .map(([k, v]) => (Array.isArray(v) && v.length === 2 ? `${k}: ${JSON.stringify(v[0])} → ${JSON.stringify(v[1])}` : `${k}: ${JSON.stringify(v)}`))
    .map((s) => (s.length > 140 ? `${s.slice(0, 140)}…` : s))
    .join("\n") + (entries.length > 6 ? `\n…and ${entries.length - 6} more` : "");
}

/** Who changed what: every sensitive change in the database, plus exports and imports. */
export default async function AuditPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireStaffPage("admin");
  const { supabase } = await requireRole("admin");
  const params = await searchParams;
  const page = pageOf(params);
  const entity = sp(params, "entity");
  const action = sp(params, "action");
  const actor = sp(params, "actor").replace(/[%,()]/g, "");
  let q = supabase.from("audit_logs").select("*", { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (entity) q = q.eq("entity_type", entity);
  if (action) q = q.eq("action", action);
  if (actor) q = q.ilike("actor_email", `%${actor}%`);
  const { data, count, error } = await q;
  const ENTITIES = ["products", "product_variants", "orders", "payments", "refunds", "coupons", "store_settings", "user_roles", "shipping_zones", "shipping_rates", "brands", "categories", "collections", "customers"];

  return (
    <>
      <PageHeader title="Audit log" description="Changes to products, prices, orders, payments, settings and roles, with who made them. Entries can't be edited or deleted." />
      {error && <Notice tone="error" className="mb-4">{error.message}</Notice>}
      <FilterBar action="/admin/audit">
        <label className="grid gap-1 text-xs text-taupe">
          Area
          <select name="entity" defaultValue={entity} className={cx(adminInput, "w-44")}>
            <option value="">Everything</option>
            {ENTITIES.map((e) => <option key={e} value={e}>{e.replace(/_/g, " ")}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-taupe">
          Action
          <select name="action" defaultValue={action} className={cx(adminInput, "w-36")}>
            <option value="">Any</option>
            <option value="insert">Created</option>
            <option value="update">Changed</option>
            <option value="delete">Deleted</option>
            <option value="export">Exported</option>
            <option value="import">Imported</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs text-taupe">By<input name="actor" defaultValue={actor} placeholder="Email" className={cx(adminInput, "w-48")} /></label>
      </FilterBar>
      {!data?.length ? (
        <Empty title="No entries" />
      ) : (
        <Table>
          <thead><tr><Th>When</Th><Th>Who</Th><Th>Action</Th><Th>What</Th><Th>Details</Th></tr></thead>
          <tbody>
            {data.map((a) => (
              <tr key={a.id} className="align-top">
                <Td className="text-xs whitespace-nowrap text-taupe">{formatDateTime(a.created_at)}</Td>
                <Td className="text-xs">{a.actor_email ?? (a.actor_id ? "Staff" : "System")}</Td>
                <Td className="text-xs">{a.action}</Td>
                <Td className="text-xs">{a.entity_type.replace(/_/g, " ")}<span className="block max-w-40 truncate font-mono text-stone">{a.entity_id}</span></Td>
                <Td><pre className="max-w-xl text-[11px] leading-snug whitespace-pre-wrap text-taupe">{summarize(a.changes)}</pre></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager page={page} pageSize={PAGE_SIZE} total={count ?? 0} href={(p) => withParams("/admin/audit", params, { page: p })} />
    </>
  );
}
