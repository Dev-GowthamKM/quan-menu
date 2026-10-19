import type { Metadata } from "next";
import BrandsManager, { type BrandRow } from "@/components/admin/catalog/BrandsManager";
import { PageHeader } from "@/components/admin/ui";
import { Notice } from "@/components/ui/controls";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Brands" };

export default async function BrandsPage() {
  const { supabase } = await requireRole("staff");
  const { data, error } = await supabase
    .from("brands")
    .select("id, name, slug, description, logo_url, banner_url, is_published, is_featured, sort_order, seo_title, seo_description, is_sample, products(count)")
    .order("sort_order")
    .order("name");
  const rows: BrandRow[] = (data ?? []).map(({ products, ...b }) => ({ ...b, product_count: (products as unknown as { count: number }[])[0]?.count ?? 0 }));
  return (
    <>
      <PageHeader title="Brands" description="Labels you sell. Published brands get their own page; featured ones appear on the homepage." />
      {error && <Notice tone="error" className="mb-4">{error.message}</Notice>}
      <BrandsManager rows={rows} />
    </>
  );
}
