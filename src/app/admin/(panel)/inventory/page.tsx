import Link from "next/link";
import type { Metadata } from "next";
import InventoryTable, { type InventoryRow } from "@/components/admin/inventory/InventoryTable";
import { adminInput, FilterBar, PageHeader, Pager, pageOf, sp, Stat, withParams } from "@/components/admin/ui";
import { buttonClass, cx, Notice } from "@/components/ui/controls";
import { HistoryIcon } from "@/components/ui/icons";
import { brandOptions, categoryOptions } from "@/lib/admin-data";
import { requireRole } from "@/lib/auth";
import type { Json } from "@/lib/database.types";

export const metadata: Metadata = { title: "Inventory" };

const PAGE_SIZE = 100;
const TABS = [
  { key: "all", label: "All variants" },
  { key: "low", label: "Low stock" },
  { key: "out", label: "Out of stock" },
  { key: "reserved", label: "Held for orders" },
] as const;

type Params = Record<string, string | string[] | undefined>;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { supabase } = await requireRole("staff");
  const params = await searchParams;
  const page = pageOf(params);
  const filters = {
    q: sp(params, "q"),
    stock: sp(params, "stock") || "all",
    brand: sp(params, "brand"),
    category: sp(params, "category"),
    status: sp(params, "status"),
    sort: sp(params, "sort") || "available_asc",
  };
  const [list, brands, categories] = await Promise.all([
    supabase.rpc("admin_inventory_list", { p: { ...filters, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE } as Json }),
    brandOptions(supabase),
    categoryOptions(supabase),
  ]);
  const data = list.data as unknown as {
    total: number;
    summary: { variants: number; out: number; low: number; reserved: number; units: number };
    rows: InventoryRow[];
  } | null;
  const s = data?.summary;

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Stock for every variant. Available = on hand minus units held by orders waiting for payment."
        actions={<Link href="/admin/inventory/history" className={buttonClass("ghost", "sm", "border-black/15! bg-white")}><HistoryIcon size={14} /> Stock history</Link>}
      />
      {list.error && <Notice tone="error" className="mb-4">Inventory couldn&apos;t load: {list.error.message}</Notice>}

      {s && (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Units on hand" value={s.units.toLocaleString("en-IN")} hint={`${s.variants} variants`} />
          <Stat label="Held by unpaid orders" value={s.reserved} hint="Released automatically if payment doesn't arrive" />
          <Link href={withParams("/admin/inventory", params, { stock: "low", page: null })}><Stat label="Low stock" value={s.low} tone={s.low ? "warn" : "default"} hint="At or below the alert level" /></Link>
          <Link href={withParams("/admin/inventory", params, { stock: "out", page: null })}><Stat label="Out of stock" value={s.out} tone={s.out ? "bad" : "default"} hint="Variants on sale with nothing available" /></Link>
        </div>
      )}

      <nav aria-label="Stock filter" className="mb-3 flex gap-1 overflow-x-auto border-b border-black/10">
        {TABS.map((t) => {
          const active = filters.stock === t.key;
          return (
            <Link key={t.key} href={withParams("/admin/inventory", params, { stock: t.key === "all" ? null : t.key, page: null })} aria-current={active ? "page" : undefined}
              className={cx("-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap", active ? "border-ink font-medium" : "border-transparent text-taupe hover:text-ink")}>
              {t.label}
            </Link>
          );
        })}
      </nav>

      <FilterBar action="/admin/inventory">
        {filters.stock !== "all" && <input type="hidden" name="stock" value={filters.stock} />}
        <label className="grid gap-1 text-xs text-taupe">
          Search
          <input name="q" defaultValue={filters.q} placeholder="SKU or product" className={cx(adminInput, "w-56")} />
        </label>
        <label className="grid gap-1 text-xs text-taupe">
          Brand
          <select name="brand" defaultValue={filters.brand} className={cx(adminInput, "w-40")}>
            <option value="">All brands</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-taupe">
          Category
          <select name="category" defaultValue={filters.category} className={cx(adminInput, "w-48")}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-taupe">
          Product status
          <select name="status" defaultValue={filters.status} className={cx(adminInput, "w-36")}>
            <option value="">Any</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs text-taupe">
          Sort
          <select name="sort" defaultValue={filters.sort} className={cx(adminInput, "w-44")}>
            <option value="available_asc">Available, low first</option>
            <option value="available_desc">Available, high first</option>
            <option value="product">Product A–Z</option>
            <option value="sku">SKU A–Z</option>
            <option value="updated">Recently changed</option>
          </select>
        </label>
      </FilterBar>

      <InventoryTable rows={data?.rows ?? []} />
      <Pager page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} href={(p) => withParams("/admin/inventory", params, { page: p })} />
    </>
  );
}
