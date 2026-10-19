// Product listing URLs: every filter lives in the query string, so listings can be
// shared, bookmarked and crawled. Prices in the URL are whole rupees.
import { SORTS, type SearchParams, type SortKey } from "./catalog";

export type RawParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const list = (v: string | string[] | undefined) =>
  one(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
const rupees = (v: string | string[] | undefined) => {
  const n = Number(one(v));
  return Number.isFinite(n) && n > 0 ? Math.round(n) * 100 : null;
};

export function parseListing(raw: RawParams): SearchParams & { page: number; sort: SortKey } {
  const sort = one(raw.sort) as SortKey;
  const page = Math.min(Math.max(parseInt(one(raw.page), 10) || 1, 1), 500);
  return {
    q: one(raw.q).trim().slice(0, 80) || null,
    category: one(raw.category) || null,
    brands: list(raw.brand),
    sizes: list(raw.size),
    colors: list(raw.color),
    min: rupees(raw.min),
    max: rupees(raw.max),
    inStock: one(raw.stock) === "1",
    onSale: one(raw.sale) === "1",
    sort: SORTS.some((s) => s.key === sort) ? sort : "featured",
    page,
  };
}

export function hasActiveFilters(p: SearchParams) {
  return !!(p.brands?.length || p.sizes?.length || p.colors?.length || p.min || p.max || p.inStock || p.onSale);
}

/** Query string for a listing, dropping empty values. */
export function listingQuery(p: Record<string, string | number | boolean | string[] | null | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (v === null || v === undefined || v === false || v === "") continue;
    if (Array.isArray(v)) {
      if (v.length) q.set(k, v.join(","));
    } else q.set(k, v === true ? "1" : String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export type ListingParams = ReturnType<typeof parseListing>;

/** Canonical URL for a listing: filters and sort collapse to the base page. */
export function listingCanonical(basePath: string, params: ListingParams) {
  return params.page > 1 ? `${basePath}?page=${params.page}` : basePath;
}
