import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EditorOptions, EditorSettings } from "@/components/admin/products/ProductEditor";
import { brandOptions, categoryOptions, manualCollectionOptions, sizeGuideOptions, tagSuggestions } from "@/lib/admin-data";
import type { Database } from "@/lib/database.types";
import { getSettings } from "@/lib/settings";
import { contextOrigin } from "@/lib/store";

export async function editorContext(sb: SupabaseClient<Database>): Promise<{ options: EditorOptions; settings: EditorSettings }> {
  const [brands, categories, sizeGuides, collections, tags, settings, origin] = await Promise.all([
    brandOptions(sb),
    categoryOptions(sb),
    sizeGuideOptions(sb),
    manualCollectionOptions(sb),
    tagSuggestions(sb),
    getSettings(),
    contextOrigin(),
  ]);
  return {
    options: { brands, categories: categories.map((c) => ({ id: c.id, label: c.label, size_guide_id: c.size_guide_id })), sizeGuides, collections, tagSuggestions: tags },
    settings: {
      storeName: settings.store_name,
      siteUrl: origin,
      taxLabel: settings.tax_label,
      taxMode: settings.tax_mode,
      returnWindowDays: settings.return_window_days,
      lowStockThreshold: settings.low_stock_threshold,
      storeType: settings.store_type,
    },
  };
}

/**
 * A product's own names for its two options ({} for a new one), or null when the database
 * doesn't have them yet (before the store types update), so the editor offers them only then.
 */
export async function productOptionNames(sb: SupabaseClient<Database>, id: string | null): Promise<{ size?: string; color?: string } | null> {
  const query = sb.from("products").select("option_names").limit(1);
  const { data, error } = id ? await query.eq("id", id).maybeSingle() : await query;
  if (error) return null;
  const names = Array.isArray(data) ? {} : data?.option_names;
  return names && typeof names === "object" && !Array.isArray(names) ? (names as { size?: string; color?: string }) : {};
}

/**
 * A product's 360° switch (false for a new one), or null when the database doesn't have it
 * yet (before the motion update), so the editor can say what's needed instead of failing.
 */
export async function productSpin(sb: SupabaseClient<Database>, id: string | null): Promise<boolean | null> {
  const query = sb.from("products").select("spin").limit(1);
  const { data, error } = id ? await query.eq("id", id).maybeSingle() : await query;
  if (error) return null;
  return Array.isArray(data) ? false : !!data?.spin;
}
