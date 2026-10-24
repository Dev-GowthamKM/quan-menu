import type { MetadataRoute } from "next";
import { getBrands, getCategories, getCollections } from "@/lib/catalog";
import { SUPABASE_CONFIGURED } from "@/lib/env";
import { contextStore, storeOrigin } from "@/lib/store";
import { supabasePublic } from "@/lib/supabase/public";

/**
 * Every public page of the store this address belongs to: the catalog comes from the
 * database, limited to what customers can see.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const store = await contextStore();
  const SITE_URL = storeOrigin(store);
  const fixed: MetadataRoute.Sitemap = ["", "/shop", "/brands", "/collections", "/faq", "/contact", "/pages/about", "/pages/shipping", "/pages/returns", "/pages/privacy", "/pages/terms"].map(
    (path) => ({ url: `${SITE_URL}${path}`, lastModified: now, changeFrequency: path === "" || path === "/shop" ? "daily" : "monthly", priority: path === "" ? 1 : 0.5 }),
  );
  if (!SUPABASE_CONFIGURED) return fixed;

  const [categories, brands, collections] = await Promise.all([getCategories(), getBrands(), getCollections()]);
  const products: { slug: string; updated_at: string }[] = [];
  const sb = supabasePublic(store.id);
  for (let from = 0; from < 45_000; from += 1000) {
    const { data, error } = await sb
      .from("products")
      .select("slug, updated_at")
      .eq("status", "active")
      .lte("published_at", now.toISOString())
      .order("published_at", { ascending: false })
      .range(from, from + 999);
    if (error || !data?.length) break;
    products.push(...data);
    if (data.length < 1000) break;
  }

  return [
    ...fixed,
    ...categories.map((c) => ({ url: `${SITE_URL}/category/${c.slug}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.7 })),
    ...brands.map((b) => ({ url: `${SITE_URL}/brands/${b.slug}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...collections.map((c) => ({ url: `${SITE_URL}/collections/${c.slug}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...products.map((p) => ({ url: `${SITE_URL}/products/${p.slug}`, lastModified: new Date(p.updated_at), changeFrequency: "weekly" as const, priority: 0.8 })),
  ];
}
