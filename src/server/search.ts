"use server";
import { getBrands, getCategories, searchProducts } from "@/lib/catalog";
import type { ProductCard } from "@/lib/types";

export interface Suggestions {
  products: ProductCard[];
  categories: { name: string; slug: string }[];
  brands: { name: string; slug: string }[];
  total: number;
}

/** Instant results for the search box (products, categories and brands). */
export async function searchSuggestions(query: string): Promise<Suggestions> {
  const q = String(query || "").trim().slice(0, 80);
  if (q.length < 2) return { products: [], categories: [], brands: [], total: 0 };
  const needle = q.toLowerCase();
  const [results, categories, brands] = await Promise.all([searchProducts({ q, limit: 6, sort: "featured" }), getCategories(), getBrands()]);
  return {
    products: results.items,
    total: results.total,
    categories: categories.filter((c) => c.name.toLowerCase().includes(needle)).slice(0, 4).map(({ name, slug }) => ({ name, slug })),
    brands: brands.filter((b) => b.name.toLowerCase().includes(needle)).slice(0, 3).map(({ name, slug }) => ({ name, slug })),
  };
}
