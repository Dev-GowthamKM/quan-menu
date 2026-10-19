import type { Metadata } from "next";
import CategoriesManager, { type CategoryRow } from "@/components/admin/catalog/CategoriesManager";
import { PageHeader } from "@/components/admin/ui";
import { Notice } from "@/components/ui/controls";
import { categoryOptions, sizeGuideOptions } from "@/lib/admin-data";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const { supabase } = await requireRole("staff");
  const [{ data, error }, order, guides] = await Promise.all([
    supabase.from("categories").select("id, parent_id, name, slug, description, image_url, banner_url, size_guide_id, is_published, sort_order, seo_title, seo_description, is_sample, products(count)"),
    categoryOptions(supabase),
    sizeGuideOptions(supabase),
  ]);
  const byId = new Map((data ?? []).map((c) => [c.id, c]));
  // Tree order from categoryOptions, with depth for indentation.
  const rows: CategoryRow[] = order
    .map((o) => {
      const c = byId.get(o.id);
      if (!c) return null;
      const { products, ...rest } = c;
      return { ...rest, depth: o.depth, path: o.path, product_count: (products as unknown as { count: number }[])[0]?.count ?? 0 };
    })
    .filter((x): x is CategoryRow => !!x);
  return (
    <>
      <PageHeader title="Categories" description="The shop's departments and the categories inside them. Top-level categories appear in the main menu." />
      {error && <Notice tone="error" className="mb-4">{error.message}</Notice>}
      <CategoriesManager rows={rows} sizeGuides={guides} />
    </>
  );
}
