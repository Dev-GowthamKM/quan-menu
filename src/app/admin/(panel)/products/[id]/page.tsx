import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductEditor, { type EditorProduct } from "@/components/admin/products/ProductEditor";
import { requireRole } from "@/lib/auth";
import { editorContext } from "../editor-data";

export const metadata: Metadata = { title: "Edit product" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { supabase } = await requireRole("staff");
  const [{ data }, ctx] = await Promise.all([
    supabase
      .from("products")
      .select(
        `id, title, slug, description, fabric, fit, care, brand_id, category_id, size_guide_id, tags, status, published_at, is_featured,
         price, compare_at_price, tax_rate_bps, weight_grams, length_mm, width_mm, height_mm, is_returnable, return_window_days,
         seo_title, seo_description, is_sample, created_at, updated_at,
         variants:product_variants(id, sku, size, color, color_hex, price, compare_at_price, stock_quantity, reserved_quantity, low_stock_threshold, barcode, weight_grams, is_active, position),
         images:product_images(id, url, storage_path, alt, color, width, height, position),
         collections:collection_products(collection_id)`,
      )
      .eq("id", id)
      .order("position", { referencedTable: "product_variants" })
      .order("position", { referencedTable: "product_images" })
      .maybeSingle(),
    editorContext(supabase),
  ]);
  if (!data) notFound();
  const { collections, ...rest } = data;
  const product: EditorProduct = { ...rest, collection_ids: (collections ?? []).map((c) => c.collection_id) };
  // Remount after each save so the form starts from what was stored (including fresh stock).
  return <ProductEditor key={data.updated_at} product={product} options={ctx.options} settings={ctx.settings} />;
}
