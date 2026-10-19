"use server";
import { getRelatedProducts, productCardsByIds, searchProducts } from "@/lib/catalog";
import type { ProductCard } from "@/lib/types";

const clean = (ids: unknown) =>
  (Array.isArray(ids) ? ids : []).filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)).slice(0, 24);

export async function getProductCards(ids: string[]): Promise<ProductCard[]> {
  return productCardsByIds(clean(ids));
}

/** "Recommended for you": products related to what this visitor looked at recently. */
export async function getRecommendations(viewedIds: string[]): Promise<ProductCard[]> {
  const viewed = clean(viewedIds);
  const seen = new Set(viewed);
  const picks: ProductCard[] = [];
  for (const id of viewed.slice(0, 3)) {
    for (const p of await getRelatedProducts(id, 8)) {
      if (!seen.has(p.id) && p.available_stock > 0) {
        seen.add(p.id);
        picks.push(p);
      }
    }
  }
  if (picks.length < 4) {
    const { items } = await searchProducts({ sort: "featured", limit: 12, inStock: true });
    for (const p of items) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        picks.push(p);
      }
    }
  }
  return picks.slice(0, 12);
}
