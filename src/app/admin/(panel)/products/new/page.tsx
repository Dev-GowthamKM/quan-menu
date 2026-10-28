import type { Metadata } from "next";
import ProductEditor, { type EditorProduct } from "@/components/admin/products/ProductEditor";
import { requireRole } from "@/lib/auth";
import { editorContext, productOptionNames, productSpin } from "../editor-data";

export const metadata: Metadata = { title: "New product" };

const BLANK: EditorProduct = {
  id: null, title: "", slug: "", description: "", fabric: "", fit: "", care: "", brand_id: null, category_id: null, size_guide_id: null,
  tags: [], status: "draft", published_at: null, is_featured: false, price: null, compare_at_price: null, tax_rate_bps: null,
  weight_grams: null, length_mm: null, width_mm: null, height_mm: null, is_returnable: true, return_window_days: null,
  seo_title: "", seo_description: "", variants: [], images: [], collection_ids: [],
};

export default async function NewProduct() {
  const { supabase } = await requireRole("staff");
  const [{ options, settings }, spin, optionNames] = await Promise.all([editorContext(supabase), productSpin(supabase, null), productOptionNames(supabase, null)]);
  return <ProductEditor product={{ ...BLANK, spin, option_names: optionNames }} options={options} settings={settings} />;
}
