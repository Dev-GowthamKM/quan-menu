// Listing options shared by the server and the browser (the catalog reads themselves are server-only).

export const PAGE_SIZE = 24;

export type SortKey = "featured" | "newest" | "price_asc" | "price_desc" | "popular";
export const SORTS: { key: SortKey; label: string }[] = [
  { key: "featured", label: "Featured" },
  { key: "newest", label: "Newest" },
  { key: "popular", label: "Popularity" },
  { key: "price_asc", label: "Price: low to high" },
  { key: "price_desc", label: "Price: high to low" },
];

export interface SearchParams {
  q?: string | null;
  category?: string | null;
  brands?: string[];
  collection?: string | null;
  sizes?: string[];
  colors?: string[];
  min?: number | null;
  max?: number | null;
  inStock?: boolean;
  onSale?: boolean;
  sort?: SortKey;
  page?: number;
  limit?: number;
  ids?: string[];
}
