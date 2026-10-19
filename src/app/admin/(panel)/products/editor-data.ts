import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EditorOptions, EditorSettings } from "@/components/admin/products/ProductEditor";
import { brandOptions, categoryOptions, manualCollectionOptions, sizeGuideOptions, tagSuggestions } from "@/lib/admin-data";
import type { Database } from "@/lib/database.types";
import { SITE_URL } from "@/lib/env";
import { getSettings } from "@/lib/settings";

export async function editorContext(sb: SupabaseClient<Database>): Promise<{ options: EditorOptions; settings: EditorSettings }> {
  const [brands, categories, sizeGuides, collections, tags, settings] = await Promise.all([
    brandOptions(sb),
    categoryOptions(sb),
    sizeGuideOptions(sb),
    manualCollectionOptions(sb),
    tagSuggestions(sb),
    getSettings(),
  ]);
  return {
    options: { brands, categories: categories.map((c) => ({ id: c.id, label: c.label, size_guide_id: c.size_guide_id })), sizeGuides, collections, tagSuggestions: tags },
    settings: {
      storeName: settings.store_name,
      siteUrl: SITE_URL,
      taxLabel: settings.tax_label,
      taxMode: settings.tax_mode,
      returnWindowDays: settings.return_window_days,
      lowStockThreshold: settings.low_stock_threshold,
    },
  };
}
