// Storefront catalog reads. Everything goes through the cookie-free public client, so
// results are cached for all visitors of a store (keyed by the store's id, tag "catalog")
// and refreshed when staff change the catalog (revalidateTag in the admin actions) or
// after at most five minutes, which is also how scheduled products appear on time.
import { unstable_cache } from "next/cache";
import { SUPABASE_CONFIGURED } from "./env";
import { contextStoreId } from "./store";
import { supabasePublic } from "./supabase/public";
import { PAGE_SIZE, type SearchParams } from "./catalog-options";
import type { Facets, ProductCard, ProductPage, Tables } from "./types";

const CACHE = { tags: ["catalog"], revalidate: 300 };

export { PAGE_SIZE, SORTS, type SearchParams, type SortKey } from "./catalog-options";

function log(where: string, error: { message: string } | null) {
  if (error) console.error(`[catalog] ${where}:`, error.message);
}

type Row = ProductCard & { total_count: number };

const searchProductsIn = unstable_cache(
  async (store: string | null, p: SearchParams): Promise<{ items: ProductCard[]; total: number }> => {
    if (!SUPABASE_CONFIGURED) return { items: [], total: 0 };
    const limit = p.limit ?? PAGE_SIZE;
    const { data, error } = await supabasePublic(store).rpc("search_products", {
      p_q: p.q || undefined,
      p_category: p.category || undefined,
      p_brands: p.brands?.length ? p.brands : undefined,
      p_collection: p.collection || undefined,
      p_sizes: p.sizes?.length ? p.sizes : undefined,
      p_colors: p.colors?.length ? p.colors : undefined,
      p_min_price: p.min ?? undefined,
      p_max_price: p.max ?? undefined,
      p_in_stock: !!p.inStock,
      p_on_sale: !!p.onSale,
      p_sort: p.sort || "featured",
      p_limit: limit,
      p_offset: Math.max((p.page ?? 1) - 1, 0) * limit,
      p_ids: p.ids?.length ? p.ids : undefined,
    });
    log("search_products", error);
    const rows = (data ?? []) as unknown as Row[];
    return {
      items: rows.map(({ total_count: _total, ...card }) => ({ ...card, swatches: card.swatches ?? [] })),
      total: rows[0]?.total_count ? Number(rows[0].total_count) : 0,
    };
  },
  ["search-products"],
  CACHE,
);

export const searchProducts = async (p: SearchParams) => searchProductsIn(await contextStoreId(), p);

/** Product cards in the order of the given ids (recently viewed, wishlist). */
export async function productCardsByIds(ids: string[]): Promise<ProductCard[]> {
  if (!ids.length) return [];
  const { items } = await searchProducts({ ids, limit: Math.min(ids.length, 100), sort: "newest" });
  const byId = new Map(items.map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is ProductCard => !!p);
}

const getFacetsIn = unstable_cache(
  async (store: string | null, q: string | null, category: string | null, collection: string | null): Promise<Facets | null> => {
    if (!SUPABASE_CONFIGURED) return null;
    const { data, error } = await supabasePublic(store).rpc("catalog_facets", {
      p_q: q || undefined,
      p_category: category || undefined,
      p_collection: collection || undefined,
    });
    log("catalog_facets", error);
    return (data as unknown as Facets) ?? null;
  },
  ["catalog-facets"],
  CACHE,
);

export const getFacets = async (q: string | null, category: string | null, collection: string | null) =>
  getFacetsIn(await contextStoreId(), q, category, collection);

const getProductPageIn = unstable_cache(
  async (store: string | null, slug: string): Promise<ProductPage | null> => {
    if (!SUPABASE_CONFIGURED) return null;
    const { data, error } = await supabasePublic(store).rpc("get_product_page", { p_slug: slug });
    log("get_product_page", error);
    return (data as unknown as ProductPage) ?? null;
  },
  ["product-page"],
  CACHE,
);

export const getProductPage = async (slug: string) => getProductPageIn(await contextStoreId(), slug);

const relatedIdsIn = unstable_cache(
  async (store: string | null, productId: string, limit: number): Promise<string[]> => {
    if (!SUPABASE_CONFIGURED) return [];
    const { data, error } = await supabasePublic(store).rpc("related_products", { p_product_id: productId, p_limit: limit });
    log("related_products", error);
    return ((data ?? []) as unknown as string[]).map(String);
  },
  ["related-products"],
  CACHE,
);

export async function getRelatedProducts(productId: string, limit = 8): Promise<ProductCard[]> {
  return productCardsByIds(await relatedIdsIn(await contextStoreId(), productId, limit));
}

export type Category = Pick<
  Tables<"categories">,
  "id" | "parent_id" | "name" | "slug" | "description" | "image_url" | "banner_url" | "sort_order" | "seo_title" | "seo_description"
>;
export type Department = Category & { children: Category[] };

const getCategoriesIn = unstable_cache(
  async (store: string | null): Promise<Category[]> => {
    if (!SUPABASE_CONFIGURED) return [];
    const { data, error } = await supabasePublic(store)
      .from("categories")
      .select("id, parent_id, name, slug, description, image_url, banner_url, sort_order, seo_title, seo_description")
      .eq("is_published", true)
      .order("sort_order")
      .order("name");
    log("categories", error);
    return data ?? [];
  },
  ["categories"],
  CACHE,
);

export const getCategories = async () => getCategoriesIn(await contextStoreId());

/** Top-level categories (Women, Men...) with their children, for navigation. */
export async function getDepartments(): Promise<Department[]> {
  const all = await getCategories();
  return all
    .filter((c) => !c.parent_id)
    .map((d) => ({ ...d, children: all.filter((c) => c.parent_id === d.id) }));
}

export async function getCategory(slug: string) {
  const all = await getCategories();
  const category = all.find((c) => c.slug === slug);
  if (!category) return null;
  const parent = category.parent_id ? all.find((c) => c.id === category.parent_id) ?? null : null;
  const children = all.filter((c) => c.parent_id === category.id);
  const siblings = parent ? all.filter((c) => c.parent_id === parent.id) : children;
  return { category, parent, children, siblings };
}

export type Brand = Pick<
  Tables<"brands">,
  "id" | "name" | "slug" | "description" | "logo_url" | "banner_url" | "is_featured" | "sort_order" | "seo_title" | "seo_description"
>;

const getBrandsIn = unstable_cache(
  async (store: string | null): Promise<Brand[]> => {
    if (!SUPABASE_CONFIGURED) return [];
    const { data, error } = await supabasePublic(store)
      .from("brands")
      .select("id, name, slug, description, logo_url, banner_url, is_featured, sort_order, seo_title, seo_description")
      .eq("is_published", true)
      .order("sort_order")
      .order("name");
    log("brands", error);
    return data ?? [];
  },
  ["brands"],
  CACHE,
);

export const getBrands = async () => getBrandsIn(await contextStoreId());

export async function getBrand(slug: string) {
  return (await getBrands()).find((b) => b.slug === slug) ?? null;
}

export type Collection = Pick<
  Tables<"collections">,
  | "id" | "title" | "slug" | "description" | "image_url" | "banner_url" | "kind" | "is_seasonal" | "season"
  | "is_featured" | "sort_order" | "product_sort" | "seo_title" | "seo_description"
>;

const getCollectionsIn = unstable_cache(
  async (store: string | null): Promise<Collection[]> => {
    if (!SUPABASE_CONFIGURED) return [];
    const { data, error } = await supabasePublic(store)
      .from("collections")
      .select("id, title, slug, description, image_url, banner_url, kind, is_seasonal, season, is_featured, sort_order, product_sort, seo_title, seo_description")
      .order("sort_order")
      .order("title");
    log("collections", error);
    return data ?? [];
  },
  ["collections"],
  CACHE,
);

export const getCollections = async () => getCollectionsIn(await contextStoreId());

export async function getCollection(slug: string) {
  return (await getCollections()).find((c) => c.slug === slug) ?? null;
}

export interface Review {
  id: string;
  rating: number;
  title: string;
  body: string;
  author_name: string;
  is_verified_purchase: boolean;
  created_at: string;
}

const getReviewsIn = unstable_cache(
  async (store: string | null, productId: string): Promise<Review[]> => {
    if (!SUPABASE_CONFIGURED) return [];
    const { data, error } = await supabasePublic(store)
      .from("product_reviews")
      .select("id, rating, title, body, author_name, is_verified_purchase, created_at")
      .eq("product_id", productId)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(50);
    log("reviews", error);
    return data ?? [];
  },
  ["reviews"],
  { tags: ["catalog", "reviews"], revalidate: 300 },
);

export const getReviews = async (productId: string) => getReviewsIn(await contextStoreId(), productId);

const getBestSellerIdsIn = unstable_cache(
  async (store: string | null, limit: number): Promise<string[]> => {
    if (!SUPABASE_CONFIGURED) return [];
    const { data, error } = await supabasePublic(store).rpc("best_seller_ids", { p_limit: limit });
    log("best_seller_ids", error);
    return ((data ?? []) as unknown as string[]).map(String);
  },
  ["best-sellers"],
  CACHE,
);

export const getBestSellerIds = async (limit = 8) => getBestSellerIdsIn(await contextStoreId(), limit);

/** Everything the home page shows, fetched in parallel. */
export async function getHomeData() {
  const [newArrivals, featured, bestIds, brands, collections, departments] = await Promise.all([
    searchProducts({ sort: "newest", limit: 12 }),
    searchProducts({ sort: "featured", limit: 8 }),
    getBestSellerIds(8),
    getBrands(),
    getCollections(),
    getDepartments(),
  ]);
  // Best sellers come from real sales only. Until there are enough, show the featured edit.
  const bestSellers = bestIds.length >= 4 ? await productCardsByIds(bestIds) : [];
  return {
    newArrivals: newArrivals.items,
    featured: featured.items,
    /** How many products are on sale, and how many brands the store has, for the Numbers section. */
    productCount: newArrivals.total,
    brandCount: brands.length,
    bestSellers: bestSellers.length >= 4 ? bestSellers : featured.items,
    bestSellersAreFeatured: bestSellers.length < 4,
    brands: brands.filter((b) => b.is_featured),
    trending: collections.filter((c) => c.is_featured),
    seasonal: collections.filter((c) => c.is_seasonal),
    departments,
  };
}
