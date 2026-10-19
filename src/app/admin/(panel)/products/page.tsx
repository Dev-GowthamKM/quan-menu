import Link from "next/link";
import type { Metadata } from "next";
import ProductTable, { type ProductRow } from "@/components/admin/products/ProductTable";
import { adminInput, FilterBar, PageHeader, Pager, pageOf, sp, withParams } from "@/components/admin/ui";
import { buttonClass, cx, Notice } from "@/components/ui/controls";
import { DownloadIcon, PlusIcon, UploadIcon } from "@/components/ui/icons";
import { brandOptions, categoryOptions, manualCollectionOptions } from "@/lib/admin-data";
import { requireRole } from "@/lib/auth";
import type { Json } from "@/lib/database.types";

export const metadata: Metadata = { title: "Products" };

const PAGE_SIZE = 50;
const TABS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "draft", label: "Drafts" },
  { key: "scheduled", label: "Scheduled" },
  { key: "archived", label: "Archived" },
] as const;

type Params = Record<string, string | string[] | undefined>;

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { supabase } = await requireRole("staff");
  const params = await searchParams;
  const status = sp(params, "status") || "all";
  const page = pageOf(params);
  const filters = {
    q: sp(params, "q"),
    status,
    brand: sp(params, "brand"),
    category: sp(params, "category"),
    stock: sp(params, "stock"),
    sort: sp(params, "sort") || "updated",
  };
  const [list, brands, categories, collections] = await Promise.all([
    supabase.rpc("admin_product_list", { p: { ...filters, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE } as Json }),
    brandOptions(supabase),
    categoryOptions(supabase),
    manualCollectionOptions(supabase),
  ]);
  const data = list.data as unknown as { counts: Record<string, number>; total: number; rows: ProductRow[] } | null;
  const exportQuery = new URLSearchParams(Object.entries(filters).filter(([, v]) => v && v !== "all") as [string, string][]).toString();

  return (
    <>
      <PageHeader
        title="Products"
        description="Everything in your catalog. Drafts and scheduled products are only visible to staff."
        actions={
          <>
            <Link href="/admin/products/import" className={buttonClass("ghost", "sm", "border-black/15! bg-white")}><UploadIcon size={14} /> Import</Link>
            <a href={`/admin/products/export${exportQuery ? `?${exportQuery}` : ""}`} className={buttonClass("ghost", "sm", "border-black/15! bg-white")}><DownloadIcon size={14} /> Export</a>
            <Link href="/admin/products/new" className={buttonClass("primary", "sm")}><PlusIcon size={14} /> Add product</Link>
          </>
        }
      />

      {list.error && <Notice tone="error" className="mb-4">Products couldn&apos;t load: {list.error.message}</Notice>}

      <nav aria-label="Product status" className="relative mb-3 flex gap-1 overflow-x-auto border-b border-black/10">
        {TABS.map((t) => {
          const active = status === t.key;
          return (
            <Link
              key={t.key}
              href={withParams("/admin/products", params, { status: t.key === "all" ? null : t.key, page: null })}
              aria-current={active ? "page" : undefined}
              className={cx("-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap", active ? "border-ink font-medium" : "border-transparent text-taupe hover:text-ink")}
            >
              {t.label} <span className="ml-1 text-xs text-stone tabular-nums">{data?.counts[t.key] ?? 0}</span>
            </Link>
          );
        })}
      </nav>

      <FilterBar action="/admin/products">
        {status !== "all" && <input type="hidden" name="status" value={status} />}
        <label className="grid gap-1 text-xs text-taupe">
          Search
          <input name="q" defaultValue={filters.q} placeholder="Title, SKU, tag, brand" className={cx(adminInput, "w-64")} />
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
          Stock
          <select name="stock" defaultValue={filters.stock} className={cx(adminInput, "w-36")}>
            <option value="">Any stock</option>
            <option value="in">In stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs text-taupe">
          Sort
          <select name="sort" defaultValue={filters.sort} className={cx(adminInput, "w-44")}>
            <option value="updated">Recently updated</option>
            <option value="newest">Newest</option>
            <option value="title">Title A–Z</option>
            <option value="price_asc">Price, low to high</option>
            <option value="price_desc">Price, high to low</option>
            <option value="stock_asc">Stock, low to high</option>
            <option value="stock_desc">Stock, high to low</option>
            <option value="best_selling">Best selling</option>
          </select>
        </label>
      </FilterBar>

      <ProductTable
        rows={data?.rows ?? []}
        total={data?.total ?? 0}
        filters={filters}
        brands={brands}
        categories={categories.map((c) => ({ id: c.id, label: c.path }))}
        collections={collections}
      />
      <Pager page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} href={(p) => withParams("/admin/products", params, { page: p })} />
    </>
  );
}
