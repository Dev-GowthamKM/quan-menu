import type { Metadata } from "next";
import CollectionEditor from "@/components/admin/catalog/CollectionEditor";
import { brandSlugOptions, categoryOptions } from "@/lib/admin-data";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "New collection" };

export default async function NewCollection() {
  const { supabase } = await requireRole("staff");
  const [brands, categories] = await Promise.all([brandSlugOptions(supabase), categoryOptions(supabase)]);
  return (
    <CollectionEditor
      collection={{
        id: null, title: "", slug: "", description: "", image_url: null, banner_url: null, kind: "manual", rules: { match: "all", conditions: [] },
        is_seasonal: false, season: "", is_featured: false, is_published: true, sort_order: 0, product_sort: "manual", starts_at: null, ends_at: null,
        seo_title: "", seo_description: "", products: [],
      }}
      brands={brands}
      categories={categories.map((c) => ({ id: c.slug, label: c.path }))}
    />
  );
}
