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
    },
  };
}
