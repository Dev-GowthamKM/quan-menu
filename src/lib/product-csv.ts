// The product CSV format, shared by the template, export and import.
//
// One row per variant. Rows with the same handle belong to one product; product columns
// are read from the first row of the product that fills them, so later rows may leave
// them blank. Prices are in rupees ("1299" or "1,299.50").
import { cleanCell, parseCsv } from "./csv";
import { toMinor } from "./money";

export const COLUMNS = [
  ["handle", "URL handle, e.g. linen-wrap-dress. Rows with the same handle are one product. Blank: made from the title."],
  ["title", "Product title. Required for new products."],
  ["status", "active, draft or archived. Applied only after every row imports (otherwise products stay drafts)."],
  ["publish_at", "Optional launch time, YYYY-MM-DD HH:mm in India time (IST)."],
  ["brand", "Brand name. Must exist unless \"create missing\" is ticked."],
  ["category", "Category slug (women-dresses) or path (Women > Dresses)."],
  ["tags", "Comma-separated tags."],
  ["collections", "Manual collection slugs or titles, separated by |."],
  ["description", "Product description. Blank lines separate paragraphs."],
  ["fabric", "Fabric and composition."],
  ["fit", "Fit and sizing notes."],
  ["care", "Care instructions."],
  ["price", "Selling price in rupees, including tax when prices include tax."],
  ["compare_at_price", "Original price shown struck through. 0 removes it."],
  ["tax_rate", "Fixed tax rate in % for this product. Blank: the store's slabs."],
  ["featured", "yes or no."],
  ["returnable", "yes or no."],
  ["return_window_days", "Days to return. Blank: store default."],
  ["weight_grams", "Packed weight in grams."],
  ["length_cm", "Packed length in cm."],
  ["width_cm", "Packed width in cm."],
  ["height_cm", "Packed height in cm."],
  ["seo_title", "Search engine title."],
  ["seo_description", "Search engine description."],
  ["sku", "Unique SKU for this variant. Required."],
  ["size", "Size, e.g. M or 32."],
  ["color", "Colour name."],
  ["color_hex", "Swatch colour, e.g. #1f2a44."],
  ["variant_price", "Price for this variant if different from the product price."],
  ["variant_compare_at_price", "Compare-at price for this variant."],
  ["stock", "Units on hand. Blank keeps the current stock (0 for new variants)."],
  ["barcode", "EAN/UPC barcode."],
  ["variant_weight_grams", "Weight if different from the product."],
  ["low_stock_alert", "Alert when available stock falls to this number."],
  ["variant_active", "yes or no (no hides the variant)."],
  ["image_urls", "Images separated by |: https URLs or file names from the media library (or dropped in with the CSV)."],
  ["image_alts", "Alt text for each image, separated by | in the same order."],
] as const;

export type Column = (typeof COLUMNS)[number][0];
export const HEADER: Column[] = COLUMNS.map((c) => c[0]);

const ALIASES: Record<string, Column> = {
  slug: "handle", url_handle: "handle",
  name: "title", product_title: "title", product_name: "title",
  published_at: "publish_at", publish_date: "publish_at", launch_date: "publish_at",
  vendor: "brand",
  product_category: "category",
  collection: "collections",
  body: "description", body_html: "description",
  material: "fabric", composition: "fabric", fabric_and_material: "fabric",
  care_instructions: "care",
  mrp: "compare_at_price", original_price: "compare_at_price", compare_at: "compare_at_price",
  tax_rate_percent: "tax_rate", gst_rate: "tax_rate", gst: "tax_rate",
  is_featured: "featured", is_returnable: "returnable", return_days: "return_window_days",
  weight: "weight_grams",
  variant_sku: "sku", option_size: "size", colour: "color", colour_hex: "color_hex", swatch: "color_hex",
  quantity: "stock", qty: "stock", inventory: "stock", stock_quantity: "stock", on_hand: "stock",
  ean: "barcode", gtin: "barcode", upc: "barcode",
  low_stock_threshold: "low_stock_alert", sell: "variant_active",
  images: "image_urls", image: "image_urls", image_src: "image_urls", image_url: "image_urls",
  image_alt: "image_alts", alt_text: "image_alts",
};

export function normalizeHeader(h: string): Column | null {
  const k = h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if ((HEADER as string[]).includes(k)) return k as Column;
  return ALIASES[k] ?? null;
}

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);

/** "red-dress-front.JPG" -> "red-dress-front", matching how uploads are named. */
export function imageBaseName(name: string) {
  const file = name.split(/[\\/]/).pop() ?? name;
  return file.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "image";
}

const isUrl = (s: string) => /^https?:\/\//i.test(s);

export interface RowIssue {
  row: number;
  message: string;
}

export interface ParsedVariant {
  sku: string;
  size?: string;
  color?: string;
  color_hex?: string;
  price?: number | null;
  compare_at_price?: number | null;
  stock?: number | null;
  barcode?: string;
  weight_grams?: number | null;
  low_stock_threshold?: number | null;
  is_active?: boolean;
}

export interface ParsedProduct {
  handle: string;
  rows: number[];
  title?: string;
  brand?: string;
  category?: string;
  description?: string;
  fabric?: string;
  fit?: string;
  care?: string;
  tags?: string[];
  collections?: string[];
  price?: number | null;
  compare_at_price?: number | null;
  tax_rate_bps?: number | null;
  weight_grams?: number | null;
  length_mm?: number | null;
  width_mm?: number | null;
  height_mm?: number | null;
  is_featured?: boolean;
  is_returnable?: boolean;
  return_window_days?: number | null;
  seo_title?: string;
  seo_description?: string;
  variants: ParsedVariant[];
  /** Image references as written in the file (URLs or file names), resolved before import. */
  imageRefs: { ref: string; alt: string }[];
  status?: "active" | "draft" | "archived";
  publish_at?: string;
}

export interface ParsedFile {
  products: ParsedProduct[];
  errors: RowIssue[];
  warnings: string[];
  rowCount: number;
  ignoredColumns: string[];
}

function parseBool(v: string): boolean | undefined | null {
  const s = v.trim().toLowerCase();
  if (!s) return undefined;
  if (["yes", "y", "true", "1", "on"].includes(s)) return true;
  if (["no", "n", "false", "0", "off"].includes(s)) return false;
  return null;
}

function parseInt0(v: string): number | undefined | null {
  const s = v.trim().replace(/,/g, "");
  if (!s) return undefined;
  return /^\d+$/.test(s) ? Number(s) : null;
}

function parseCm(v: string): number | undefined | null {
  const s = v.trim();
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) : null;
}

/** "2026-11-01 10:00" (IST) or a full ISO timestamp -> ISO string. */
export function parseIstDate(v: string): string | null {
  const s = v.trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (m) {
    const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0)) - 330 * 60_000;
    const d = new Date(utc);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(s);
  return /\d{4}-\d{2}-\d{2}T/.test(s) && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

const STATUS: Record<string, ParsedProduct["status"]> = {
  active: "active", published: "active", live: "active",
  draft: "draft", hidden: "draft", unpublished: "draft",
  archived: "archived",
};

export function parseProductCsv(text: string): ParsedFile {
  const table = parseCsv(text);
  const errors: RowIssue[] = [];
  const warnings: string[] = [];
  if (table.length < 2) return { products: [], errors: [{ row: 1, message: "The file has no product rows." }], warnings, rowCount: 0, ignoredColumns: [] };

  const header = table[0].map(normalizeHeader);
  const ignoredColumns = table[0].filter((_, i) => header[i] === null).map((h) => h.trim()).filter(Boolean);
  if (!header.includes("sku")) errors.push({ row: 1, message: "The file needs a sku column." });
  if (!header.includes("handle") && !header.includes("title")) errors.push({ row: 1, message: "The file needs a handle or title column." });
  if (errors.length) return { products: [], errors, warnings, rowCount: table.length - 1, ignoredColumns };

  const byHandle = new Map<string, ParsedProduct>();
  const rowPrice = new Map<ParsedVariant, number>();
  const skuOwner = new Map<string, { handle: string; row: number }>();

  table.slice(1).forEach((cells, i) => {
    const rowNo = i + 2;
    const get = (c: Column) => {
      const idx = header.indexOf(c);
      return idx >= 0 ? cleanCell(cells[idx] ?? "") : "";
    };
    const issue = (message: string) => errors.push({ row: rowNo, message });

    const title = get("title");
    const handle = (get("handle") ? slugify(get("handle")) : "") || (title ? slugify(title) : "");
    if (!handle) return issue("Needs a handle or a title.");
    let p = byHandle.get(handle);
    if (!p) {
      p = { handle, rows: [], variants: [], imageRefs: [] };
      byHandle.set(handle, p);
    }
    p.rows.push(rowNo);

    // Product fields: the first row that fills a column wins.
    const text = (key: "title" | "brand" | "category" | "description" | "fabric" | "fit" | "care" | "seo_title" | "seo_description", col: Column, max: number) => {
      const v = get(col);
      if (!v || p![key] !== undefined) return;
      if (v.length > max) return issue(`${col} is longer than ${max} characters.`);
      p![key] = v;
    };
    text("title", "title", 200);
    text("brand", "brand", 120);
    text("category", "category", 240);
    text("description", "description", 20000);
    text("fabric", "fabric", 2000);
    text("fit", "fit", 2000);
    text("care", "care", 2000);
    text("seo_title", "seo_title", 120);
    text("seo_description", "seo_description", 320);

    if (get("tags") && !p.tags) p.tags = [...new Set(get("tags").split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 40);
    if (get("collections") && !p.collections) p.collections = get("collections").split("|").map((t) => t.trim()).filter(Boolean);

    const money = (col: Column) => {
      const v = get(col);
      if (!v) return undefined;
      const m = toMinor(v);
      if (m === null) issue(`${col} "${v}" isn't an amount in rupees.`);
      return m;
    };
    const price = money("price");
    if (price !== undefined && price !== null && p.price === undefined) p.price = price;
    const compare = money("compare_at_price");
    if (compare !== undefined && compare !== null && p.compare_at_price === undefined) p.compare_at_price = compare;

    const tax = get("tax_rate");
    if (tax && p.tax_rate_bps === undefined) {
      const n = Number(tax.replace("%", ""));
      if (!Number.isFinite(n) || n < 0 || n > 50) issue(`tax_rate "${tax}" should be a percentage between 0 and 50.`);
      else p.tax_rate_bps = Math.round(n * 100);
    }
    const bool = (col: Column, key: "is_featured" | "is_returnable") => {
      const b = parseBool(get(col));
      if (b === null) issue(`${col} should be yes or no.`);
      else if (b !== undefined && p![key] === undefined) p![key] = b;
    };
    bool("featured", "is_featured");
    bool("returnable", "is_returnable");
    const int = (col: Column, key: "return_window_days" | "weight_grams") => {
      const n = parseInt0(get(col));
      if (n === null) issue(`${col} should be a whole number.`);
      else if (n !== undefined && p![key] === undefined) p![key] = n;
    };
    int("return_window_days", "return_window_days");
    int("weight_grams", "weight_grams");
    for (const [col, key] of [["length_cm", "length_mm"], ["width_cm", "width_mm"], ["height_cm", "height_mm"]] as const) {
      const n = parseCm(get(col));
      if (n === null) issue(`${col} should be a number.`);
      else if (n !== undefined && p[key] === undefined) p[key] = n;
    }

    const status = get("status");
    if (status && !p.status) {
      const s = STATUS[status.toLowerCase()];
      if (!s) issue(`status "${status}" should be active, draft or archived.`);
      else p.status = s;
    }
    const publishAt = get("publish_at");
    if (publishAt && !p.publish_at) {
      const iso = parseIstDate(publishAt);
      if (!iso) issue(`publish_at "${publishAt}" should look like 2026-11-01 10:00.`);
      else p.publish_at = iso;
    }

    const urls = get("image_urls").split("|").map((s) => s.trim()).filter(Boolean);
    const alts = get("image_alts").split("|").map((s) => s.trim());
    urls.forEach((ref, j) => {
      if (!p!.imageRefs.some((r) => r.ref === ref)) p!.imageRefs.push({ ref, alt: (alts[j] ?? "").slice(0, 300) });
    });
    if (p.imageRefs.length > 30) issue("A product can have at most 30 images.");

    // Variant
    const sku = get("sku").toUpperCase();
    if (!sku) return issue("Missing SKU.");
    if (!/^[A-Z0-9][A-Z0-9._/-]{0,63}$/.test(sku)) return issue(`SKU "${sku}" can only use letters, numbers, dots, dashes, slashes and underscores.`);
    const owner = skuOwner.get(sku);
    if (owner) return issue(owner.handle === handle ? `SKU ${sku} is repeated (also on row ${owner.row}).` : `SKU ${sku} is also used by "${owner.handle}" on row ${owner.row}.`);
    skuOwner.set(sku, { handle, row: rowNo });

    // Blank size or colour keeps an existing variant's value (and means none for a new one).
    const v: ParsedVariant = { sku };
    if (get("size")) v.size = get("size").slice(0, 30);
    if (get("color")) v.color = get("color").slice(0, 40);
    const hex = get("color_hex");
    if (hex) {
      if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) issue(`color_hex "${hex}" should look like #1f2a44.`);
      else v.color_hex = hex.startsWith("#") ? hex.toLowerCase() : `#${hex.toLowerCase()}`;
    }
    const vp = money("variant_price");
    if (vp !== undefined) v.price = vp;
    else if (price !== undefined && price !== null) rowPrice.set(v, price);
    const vc = money("variant_compare_at_price");
    if (vc !== undefined) v.compare_at_price = vc;
    const stock = parseInt0(get("stock"));
    if (stock === null) issue(`stock "${get("stock")}" should be a whole number of units.`);
    else if (stock !== undefined) v.stock = stock;
    const barcode = get("barcode");
    if (barcode) v.barcode = barcode.slice(0, 64);
    const vw = parseInt0(get("variant_weight_grams"));
    if (vw === null) issue("variant_weight_grams should be a whole number.");
    else if (vw !== undefined) v.weight_grams = vw;
    const low = parseInt0(get("low_stock_alert"));
    if (low === null) issue("low_stock_alert should be a whole number.");
    else if (low !== undefined) v.low_stock_threshold = low;
    const active = parseBool(get("variant_active"));
    if (active === null) issue("variant_active should be yes or no.");
    else if (active !== undefined) v.is_active = active;
    if ((v.size || v.color) && p.variants.some((x) => (x.size ?? "").toLowerCase() === (v.size ?? "").toLowerCase() && (x.color ?? "").toLowerCase() === (v.color ?? "").toLowerCase())) {
      issue(`Another row of "${handle}" has the same size and colour.`);
    }
    p.variants.push(v);
  });

  // Files that put the price on every row: a row whose price differs from the product's
  // becomes that variant's own price.
  for (const p of byHandle.values()) {
    for (const v of p.variants) {
      const rp = rowPrice.get(v);
      if (rp !== undefined && p.price !== undefined && p.price !== null && rp !== p.price) v.price = rp;
    }
    if (p.compare_at_price !== undefined && p.compare_at_price !== null && p.compare_at_price !== 0 && p.price != null && p.compare_at_price <= p.price) {
      errors.push({ row: p.rows[0], message: `compare_at_price must be higher than the price for "${p.handle}".` });
    }
  }
  if (ignoredColumns.length) warnings.push(`These columns aren't used and were ignored: ${ignoredColumns.join(", ")}.`);
  return { products: [...byHandle.values()], errors, warnings, rowCount: table.length - 1, ignoredColumns };
}

/** Splits image references into URLs and library file names. */
export function imageNamesOf(products: ParsedProduct[]) {
  const names = new Set<string>();
  for (const p of products) for (const r of p.imageRefs) if (!isUrl(r.ref)) names.add(imageBaseName(r.ref));
  return [...names];
}

export { isUrl };
