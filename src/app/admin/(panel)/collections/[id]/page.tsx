import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CollectionEditor, { type EditorCollection } from "@/components/admin/catalog/CollectionEditor";
import { brandSlugOptions, categoryOptions } from "@/lib/admin-data";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Edit collection" };

export default async function EditCollection({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireRole("staff");
  const [{ data }, brands, categories] = await Promise.all([
    supabase
      .from("collections")
      .select(`id, title, slug, description, image_url, banner_url, kind, rules, is_seasonal, season, is_featured, is_published, sort_order,
               product_sort, starts_at, ends_at, seo_title, seo_description, updated_at,
               items:collection_products(position, product:products(id, title, status, published_at, images:product_images(url, position)))`)
      .eq("id", id)
      .maybeSingle(),
    brandSlugOptions(supabase),
    categoryOptions(supabase),
  ]);
  if (!data) notFound();
  const { items, updated_at, ...rest } = data;
  const collection: EditorCollection = {
    ...rest,
    kind: rest.kind as "manual" | "automated",
    product_sort: rest.product_sort as EditorCollection["product_sort"],
    rules: (rest.rules as unknown as EditorCollection["rules"]) ?? { match: "all", conditions: [] },
    products: [...(items ?? [])]
      .sort((a, b) => a.position - b.position)
      .filter((i) => i.product)
      .map((i) => ({
        id: i.product!.id,
        title: i.product!.title,
        status: i.product!.status === "active" && i.product!.published_at && new Date(i.product!.published_at) > new Date() ? "scheduled" : i.product!.status,
        image: [...(i.product!.images ?? [])].sort((a, b) => a.position - b.position)[0]?.url ?? null,
      })),
  };
  return <CollectionEditor key={updated_at} collection={collection} brands={brands} categories={categories.map((c) => ({ id: c.slug, label: c.path }))} />;
}
