"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { AccessError, requireRole } from "@/lib/auth";
import { CATALOG_BUCKET } from "@/lib/env";
import { fail, friendlyError, ok, type ActionResult } from "@/lib/errors";
import type { Json } from "@/lib/database.types";

// Catalog changes made by staff. Every action checks the role first, then runs with the
// staff member's own session so row-level security applies as a second line of defence.
// The storefront cache (tag "catalog") is refreshed after each change.

async function staff() {
  try {
    return await requireRole("staff");
  } catch (e) {
    if (e instanceof AccessError) return null;
    throw e;
  }
}

function refreshStore(paths: string[] = []) {
  revalidateTag("catalog");
  for (const p of paths) revalidatePath(p);
}

const money = z.number().int().min(0).max(1_000_000_000);
const variantSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  sku: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/, "SKUs use letters, numbers, dots, dashes, slashes or underscores."),
  size: z.string().trim().max(30).default(""),
  color: z.string().trim().max(40).default(""),
  color_hex: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  price: money.nullable().optional(),
  compare_at_price: money.nullable().optional(),
  stock_quantity: z.number().int().min(0).max(1_000_000),
  stock_loaded: z.number().int().min(0).nullable().optional(),
  low_stock_threshold: z.number().int().min(0).max(10000).nullable().optional(),
  barcode: z.string().trim().max(64).nullable().optional(),
  weight_grams: z.number().int().min(0).max(100000).nullable().optional(),
  is_active: z.boolean().default(true),
});
const imageSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  url: z.string().url().or(z.string().startsWith("/")),
  storage_path: z.string().max(500).nullable().optional(),
  alt: z.string().max(300).default(""),
  color: z.string().max(40).nullable().optional(),
  width: z.number().int().nullable().optional(),
  height: z.number().int().nullable().optional(),
});
const productSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1, "Enter a product title.").max(200),
  slug: z.string().trim().toLowerCase().max(120).default(""),
  brand_id: z.string().uuid().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  size_guide_id: z.string().uuid().nullable().optional(),
  description: z.string().max(20000).default(""),
  fabric: z.string().max(2000).default(""),
  fit: z.string().max(2000).default(""),
  care: z.string().max(2000).default(""),
  tags: z.array(z.string().trim().max(40)).max(40).default([]),
  status: z.enum(["draft", "active", "archived"]),
  published_at: z.string().datetime({ offset: true }).nullable().optional(),
  is_featured: z.boolean().default(false),
  price: money,
  compare_at_price: money.nullable().optional(),
  tax_rate_bps: z.number().int().min(0).max(5000).nullable().optional(),
  weight_grams: z.number().int().min(0).max(100000).nullable().optional(),
  length_mm: z.number().int().min(0).max(10000).nullable().optional(),
  width_mm: z.number().int().min(0).max(10000).nullable().optional(),
  height_mm: z.number().int().min(0).max(10000).nullable().optional(),
  is_returnable: z.boolean().default(true),
  return_window_days: z.number().int().min(0).max(365).nullable().optional(),
  seo_title: z.string().max(120).default(""),
  seo_description: z.string().max(320).default(""),
  variants: z.array(variantSchema).min(1, "Add at least one variant.").max(250),
  images: z.array(imageSchema).max(30).default([]),
  collection_ids: z.array(z.string().uuid()).optional(),
});
export type ProductInput = z.input<typeof productSchema>;

export async function saveProduct(input: ProductInput, removedPaths: string[] = []): Promise<ActionResult<{ id: string }>> {
  const ctx = await staff();
  if (!ctx) return fail("Your session has expired or you no longer have staff access.");
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(`${issue?.path.join(".") ? `${issue.path.join(".")}: ` : ""}${issue?.message ?? "Check the form."}`);
  }
  const { data, error } = await ctx.supabase.rpc("admin_save_product", { p: parsed.data as unknown as Json });
  if (error) return fail(friendlyError(error, "The product couldn't be saved."));
  await cleanupMedia(removedPaths);
  refreshStore(["/admin/products"]);
  return ok({ id: data as string }, "Product saved.");
}

/** Deletes uploaded files that no catalog row uses any more. */
async function cleanupMedia(paths: string[]) {
  const ctx = await staff();
  const list = paths.filter((p) => typeof p === "string" && p && !p.includes("..")).slice(0, 100);
  if (!ctx || !list.length) return;
  const { data } = await ctx.supabase.rpc("unreferenced_media", { p_paths: list });
  const unused = (data ?? []) as unknown as string[];
  if (unused.length) await ctx.supabase.storage.from(CATALOG_BUCKET).remove(unused);
}

export async function duplicateProduct(id: string): Promise<ActionResult<{ id: string }>> {
  const ctx = await staff();
  if (!ctx) return fail("Staff access required.");
  const { data, error } = await ctx.supabase.rpc("admin_duplicate_product", { p_id: id });
  if (error) return fail(friendlyError(error));
  refreshStore(["/admin/products"]);
  return ok({ id: data as string }, "Copy created as a draft.");
}

export async function deleteProducts(ids: string[]): Promise<ActionResult<{ deleted: number; archived: number }>> {
  const ctx = await staff();
  if (!ctx) return fail("Staff access required.");
  const { data, error } = await ctx.supabase.rpc("admin_delete_products", { p_ids: ids.slice(0, 500) });
  if (error) return fail(friendlyError(error));
  refreshStore(["/admin/products"]);
  const r = data as { deleted: number; archived: number };
  return ok(r, r.archived ? `${r.deleted} deleted. ${r.archived} with past orders were archived instead, to keep order history.` : `${r.deleted} deleted.`);
}

const BULK = ["status", "category", "brand", "featured", "price_set", "price_percent", "compare_at_clear", "add_tag", "remove_tag", "collection_add", "collection_remove"] as const;

export async function bulkUpdateProducts(ids: string[], action: (typeof BULK)[number], value: string | number | boolean | null): Promise<ActionResult<{ count: number }>> {
  const ctx = await staff();
  if (!ctx) return fail("Staff access required.");
  if (!BULK.includes(action)) return fail("Unknown action.");
  const { data, error } = await ctx.supabase.rpc("admin_bulk_update_products", { p_ids: ids.slice(0, 1000), p_action: action, p_value: value as Json });
  if (error) return fail(friendlyError(error));
  refreshStore(["/admin/products"]);
  return ok({ count: Number(data) }, `Updated ${ids.length} product${ids.length === 1 ? "" : "s"}.`);
}

/** Quick edit from the product list: price, status and stock without opening the editor. */
export async function quickEditProduct(input: {
  id: string;
  price: number;
  compare_at_price: number | null;
  status: "draft" | "active" | "archived";
  stock: { variant_id: string; quantity: number; loaded: number }[];
}): Promise<ActionResult<null>> {
  const ctx = await staff();
  if (!ctx) return fail("Staff access required.");
  if (!Number.isInteger(input.price) || input.price < 0) return fail("Enter a valid price.");
  if (input.compare_at_price !== null && input.compare_at_price <= input.price) return fail("The compare-at price must be higher than the price.");
  const { error } = await ctx.supabase
    .from("products")
    .update({ price: input.price, compare_at_price: input.compare_at_price, status: input.status })
    .eq("id", input.id);
  if (error) return fail(friendlyError(error));
  const changed = input.stock.filter((s) => s.quantity !== s.loaded);
  if (changed.length) {
    const res = await ctx.supabase.rpc("admin_set_stock", { p_items: changed as unknown as Json, p_reason: "adjustment", p_note: "Quick edit" });
    if (res.error) return fail(friendlyError(res.error));
  }
  refreshStore(["/admin/products"]);
  return ok(null, "Saved.");
}

export async function setStock(items: { variant_id: string; quantity?: number; delta?: number; loaded?: number }[], reason: string, note: string): Promise<ActionResult<{ count: number }>> {
  const ctx = await staff();
  if (!ctx) return fail("Staff access required.");
  const reasons = ["restock", "adjustment", "correction", "damaged", "return", "initial", "import"];
  if (!reasons.includes(reason)) return fail("Choose a reason for the change.");
  const { data, error } = await ctx.supabase.rpc("admin_set_stock", {
    p_items: items.slice(0, 1000) as unknown as Json,
    p_reason: reason as "adjustment",
    p_note: note.slice(0, 500),
  });
  if (error) return fail(friendlyError(error));
  refreshStore(["/admin/inventory"]);
  return ok({ count: Number(data) }, `${data} variant${data === 1 ? "" : "s"} updated.`);
}

// --- Brands, categories, collections, size guides -------------------------------------

const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens.").max(120);
const optionalUrl = z.string().trim().max(1000).nullable().optional().transform((v) => v || null);

const brandSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(120),
  slug,
  description: z.string().max(5000).default(""),
  logo_url: optionalUrl,
  banner_url: optionalUrl,
  is_published: z.boolean(),
  is_featured: z.boolean(),
  sort_order: z.number().int().default(0),
  seo_title: z.string().max(120).default(""),
  seo_description: z.string().max(320).default(""),
});

export async function saveBrand(input: z.input<typeof brandSchema>): Promise<ActionResult<{ id: string }>> {
  const ctx = await staff();
  if (!ctx) return fail("Staff access required.");
  const parsed = brandSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const { id, ...row } = parsed.data;
  const res = id
    ? await ctx.supabase.from("brands").update(row).eq("id", id).select("id").single()
    : await ctx.supabase.from("brands").insert(row).select("id").single();
  if (res.error) return fail(friendlyError(res.error));
  refreshStore(["/admin/brands"]);
  return ok({ id: res.data.id }, "Brand saved.");
}

const categorySchema = z.object({
  id: z.string().uuid().nullable().optional(),
  parent_id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(120),
  slug,
  description: z.string().max(5000).default(""),
  image_url: optionalUrl,
  banner_url: optionalUrl,
  size_guide_id: z.string().uuid().nullable().optional(),
  is_published: z.boolean(),
  sort_order: z.number().int().default(0),
  seo_title: z.string().max(120).default(""),
  seo_description: z.string().max(320).default(""),
});

export async function saveCategory(input: z.input<typeof categorySchema>): Promise<ActionResult<{ id: string }>> {
  const ctx = await staff();
  if (!ctx) return fail("Staff access required.");
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const { id, ...row } = parsed.data;
  const res = id
    ? await ctx.supabase.from("categories").update(row).eq("id", id).select("id").single()
    : await ctx.supabase.from("categories").insert(row).select("id").single();
  if (res.error) return fail(friendlyError(res.error));
  refreshStore(["/admin/categories"]);
  return ok({ id: res.data.id }, "Category saved.");
}

const conditionSchema = z.object({
  field: z.enum(["tag", "brand", "category", "title", "price", "on_sale", "color", "size", "created_within_days"]),
  op: z.enum(["equals", "not_equals", "contains", "lt", "gt"]).default("equals"),
  value: z.string().trim().min(1).max(120),
});
const collectionSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(120),
  slug,
  description: z.string().max(5000).default(""),
  image_url: optionalUrl,
  banner_url: optionalUrl,
  kind: z.enum(["manual", "automated"]),
  rules: z.object({ match: z.enum(["all", "any"]), conditions: z.array(conditionSchema).max(20) }),
  is_seasonal: z.boolean(),
  season: z.string().max(60).default(""),
  is_featured: z.boolean(),
  is_published: z.boolean(),
  sort_order: z.number().int().default(0),
  product_sort: z.enum(["manual", "newest", "price_asc", "price_desc", "best_selling"]),
  starts_at: z.string().datetime({ offset: true }).nullable().optional(),
  ends_at: z.string().datetime({ offset: true }).nullable().optional(),
  seo_title: z.string().max(120).default(""),
  seo_description: z.string().max(320).default(""),
  product_ids: z.array(z.string().uuid()).max(1000).optional(),
});

export async function saveCollection(input: z.input<typeof collectionSchema>): Promise<ActionResult<{ id: string }>> {
  const ctx = await staff();
  if (!ctx) return fail("Staff access required.");
  const parsed = collectionSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const { id, product_ids, ...row } = parsed.data;
  if (row.kind === "automated" && row.rules.conditions.length === 0) return fail("Add at least one rule for an automated collection.");
  const res = id
    ? await ctx.supabase.from("collections").update(row).eq("id", id).select("id").single()
    : await ctx.supabase.from("collections").insert(row).select("id").single();
  if (res.error) return fail(friendlyError(res.error));
  const collectionId = res.data.id;
  if (row.kind === "manual" && product_ids) {
    const del = await ctx.supabase.from("collection_products").delete().eq("collection_id", collectionId);
    if (del.error) return fail(friendlyError(del.error));
    if (product_ids.length) {
      const ins = await ctx.supabase.from("collection_products").insert(product_ids.map((pid, position) => ({ collection_id: collectionId, product_id: pid, position })));
      if (ins.error) return fail(friendlyError(ins.error));
    }
  }
  refreshStore(["/admin/collections"]);
  return ok({ id: collectionId }, "Collection saved.");
}

const guideSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).default(""),
  unit: z.enum(["cm", "in"]),
  columns: z.array(z.string().trim().max(40)).min(1).max(12),
  rows: z.array(z.array(z.string().trim().max(40)).max(12)).max(40),
  how_to_measure: z.string().max(2000).default(""),
});

export async function saveSizeGuide(input: z.input<typeof guideSchema>): Promise<ActionResult<{ id: string }>> {
  const ctx = await staff();
  if (!ctx) return fail("Staff access required.");
  const parsed = guideSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const { id, ...row } = parsed.data;
  const res = id
    ? await ctx.supabase.from("size_guides").update(row).eq("id", id).select("id").single()
    : await ctx.supabase.from("size_guides").insert(row).select("id").single();
  if (res.error) return fail(friendlyError(res.error));
  refreshStore(["/admin/size-guides"]);
  return ok({ id: res.data.id }, "Size guide saved.");
}

const deletable = { brands: "/admin/brands", categories: "/admin/categories", collections: "/admin/collections", size_guides: "/admin/size-guides" } as const;

export async function deleteCatalogRow(table: keyof typeof deletable, id: string): Promise<ActionResult<null>> {
  const ctx = await staff();
  if (!ctx) return fail("Staff access required.");
  if (!(table in deletable)) return fail("Unknown item.");
  if (table === "brands" || table === "categories") {
    // Products would silently lose their brand or category, so ask for a move first.
    const column = table === "brands" ? "brand_id" : "category_id";
    const { count } = await ctx.supabase.from("products").select("id", { count: "exact", head: true }).eq(column, id);
    if (count) return fail(`${count} product${count === 1 ? " is" : "s are"} still in it. Move ${count === 1 ? "it" : "them"} to another ${table === "brands" ? "brand" : "category"} first (bulk actions on the product list can do this).`);
  }
  const { error } = await ctx.supabase.from(table).delete().eq("id", id);
  if (error) {
    return fail(error.code === "23503" ? "It's still in use (products or subcategories point to it). Move them first." : friendlyError(error));
  }
  refreshStore([deletable[table]]);
  return ok(null, "Deleted.");
}

export async function deleteMedia(paths: string[]): Promise<ActionResult<{ deleted: number; kept: number }>> {
  const ctx = await staff();
  if (!ctx) return fail("Staff access required.");
  const list = paths.filter((p) => p && !p.includes("..")).slice(0, 100);
  const { data } = await ctx.supabase.rpc("unreferenced_media", { p_paths: list });
  const unused = (data ?? []) as unknown as string[];
  if (unused.length) {
    const { error } = await ctx.supabase.storage.from(CATALOG_BUCKET).remove(unused);
    if (error) return fail(error.message);
  }
  revalidatePath("/admin/media");
  const kept = list.length - unused.length;
  return ok({ deleted: unused.length, kept }, kept ? `${unused.length} deleted; ${kept} kept because products or pages still use them.` : `${unused.length} deleted.`);
}

// --- Product list helpers ---------------------------------------------------------------

export interface QuickEditData {
  id: string;
  title: string;
  price: number;
  compare_at_price: number | null;
  status: "draft" | "active" | "archived";
  variants: { id: string; sku: string; size: string; color: string; stock_quantity: number; reserved_quantity: number }[];
}

export async function getQuickEdit(id: string): Promise<ActionResult<QuickEditData>> {
  const ctx = await staff();
  if (!ctx) return fail("Staff access required.");
  const { data, error } = await ctx.supabase
    .from("products")
    .select("id, title, price, compare_at_price, status, variants:product_variants(id, sku, size, color, stock_quantity, reserved_quantity, position)")
    .eq("id", id)
    .order("position", { referencedTable: "product_variants" })
    .single();
  if (error) return fail(friendlyError(error));
  return ok(data as unknown as QuickEditData);
}

const listFilters = z.object({
  q: z.string().max(200).optional(),
  status: z.enum(["all", "active", "draft", "scheduled", "archived"]).optional(),
  brand: z.string().uuid().or(z.literal("")).optional(),
  category: z.string().uuid().or(z.literal("")).optional(),
  stock: z.enum(["", "in", "low", "out"]).optional(),
});

/** Every product id matching the list filters (for "select all matching"). */
export async function productIdsMatching(filters: z.input<typeof listFilters>): Promise<ActionResult<string[]>> {
  const ctx = await staff();
  if (!ctx) return fail("Staff access required.");
  const parsed = listFilters.safeParse(filters);
  if (!parsed.success) return fail("Invalid filters.");
  const { data, error } = await ctx.supabase.rpc("admin_product_list", { p: { ...parsed.data, ids_only: true } as Json });
  if (error) return fail(friendlyError(error));
  return ok((data ?? []) as string[]);
}

/** SKUs another product already uses, for live feedback in the editor. */
export async function skuConflicts(skus: string[], productId: string | null): Promise<ActionResult<{ sku: string; title: string; product_id: string }[]>> {
  const ctx = await staff();
  if (!ctx) return fail("Staff access required.");
  const list = skus.map((s) => s.trim()).filter(Boolean).slice(0, 250);
  if (!list.length) return ok([]);
  const { data, error } = await ctx.supabase.rpc("admin_sku_conflicts", { p_skus: list, p_product_id: productId ?? (null as unknown as string) });
  if (error) return fail(friendlyError(error));
  return ok((data ?? []) as { sku: string; title: string; product_id: string }[]);
}

// --- CSV import -------------------------------------------------------------------------

const importVariant = z.object({
  sku: z.string().trim().min(1).max(64),
  size: z.string().max(30).optional(),
  color: z.string().max(40).optional(),
  color_hex: z.string().max(7).optional(),
  price: z.number().int().min(0).nullable().optional(),
  compare_at_price: z.number().int().min(0).nullable().optional(),
  stock: z.number().int().min(0).max(1_000_000).nullable().optional(),
  barcode: z.string().max(64).optional(),
  weight_grams: z.number().int().min(0).max(100000).nullable().optional(),
  low_stock_threshold: z.number().int().min(0).max(10000).nullable().optional(),
  is_active: z.boolean().optional(),
});
const importProduct = z.object({
  handle: z.string().trim().min(1).max(120),
  rows: z.array(z.number().int()).max(300),
  title: z.string().max(200).optional(),
  brand: z.string().max(120).optional(),
  category: z.string().max(240).optional(),
  description: z.string().max(20000).optional(),
  fabric: z.string().max(2000).optional(),
  fit: z.string().max(2000).optional(),
  care: z.string().max(2000).optional(),
  tags: z.array(z.string().max(40)).max(40).optional(),
  collections: z.array(z.string().max(120)).max(40).optional(),
  price: z.number().int().min(0).nullable().optional(),
  compare_at_price: z.number().int().min(0).nullable().optional(),
  tax_rate_bps: z.number().int().min(0).max(5000).nullable().optional(),
  weight_grams: z.number().int().min(0).max(100000).nullable().optional(),
  length_mm: z.number().int().min(0).max(10000).nullable().optional(),
  width_mm: z.number().int().min(0).max(10000).nullable().optional(),
  height_mm: z.number().int().min(0).max(10000).nullable().optional(),
  is_featured: z.boolean().optional(),
  is_returnable: z.boolean().optional(),
  return_window_days: z.number().int().min(0).max(365).nullable().optional(),
  seo_title: z.string().max(120).optional(),
  seo_description: z.string().max(320).optional(),
  images: z.array(z.object({ url: z.string().max(1000), storage_path: z.string().max(500).optional(), alt: z.string().max(300).optional() })).max(30).optional(),
  variants: z.array(importVariant).min(1).max(250),
});
const importOptions = z.object({ dry_run: z.boolean(), update_existing: z.boolean(), create_missing: z.boolean() });

export type ImportProduct = z.input<typeof importProduct>;
export interface ImportResult {
  handle: string;
  rows: number[];
  ok: boolean;
  action: "create" | "update" | null;
  id?: string | null;
  error?: string;
}

/** Validates (dry run) or imports one batch of products from a CSV file. */
export async function importProducts(products: ImportProduct[], options: z.input<typeof importOptions>): Promise<ActionResult<ImportResult[]>> {
  const ctx = await staff();
  if (!ctx) return fail("Your session has expired or you no longer have staff access.");
  if (products.length > 50) return fail("Send at most 50 products per batch.");
  const opts = importOptions.safeParse(options);
  if (!opts.success) return fail("Invalid import options.");
  const results: ImportResult[] = [];
  const valid: z.output<typeof importProduct>[] = [];
  for (const p of products) {
    const parsed = importProduct.safeParse(p);
    if (parsed.success) valid.push(parsed.data);
    else {
      const issue = parsed.error.issues[0];
      results.push({ handle: String(p.handle ?? ""), rows: Array.isArray(p.rows) ? p.rows : [], ok: false, action: null, error: `${issue.path.join(".")}: ${issue.message}` });
    }
  }
  if (valid.length) {
    const { data, error } = await ctx.supabase.rpc("admin_import_products", { p_products: valid as unknown as Json, p_options: opts.data as unknown as Json });
    if (error) return fail(friendlyError(error, "The import couldn't run."));
    results.push(...((data ?? []) as unknown as ImportResult[]));
  }
  if (!opts.data.dry_run) refreshStore(["/admin/products"]);
  return ok(results);
}

/** Final import step: statuses and publish dates from the file, applied only after every row imported. */
export async function applyImportStatuses(items: { id: string; status: "draft" | "active" | "archived"; published_at: string | null }[]): Promise<ActionResult<{ count: number }>> {
  const ctx = await staff();
  if (!ctx) return fail("Staff access required.");
  const parsed = z
    .array(z.object({ id: z.string().uuid(), status: z.enum(["draft", "active", "archived"]), published_at: z.string().datetime({ offset: true }).nullable() }))
    .max(5000)
    .safeParse(items);
  if (!parsed.success) return fail("Invalid statuses.");
  let count = 0;
  for (let i = 0; i < parsed.data.length; i += 200) {
    const { data, error } = await ctx.supabase.rpc("admin_import_apply_status", { p_items: parsed.data.slice(i, i + 200) as unknown as Json });
    if (error) return fail(friendlyError(error));
    count += Number(data);
  }
  refreshStore(["/admin/products"]);
  return ok({ count }, `Statuses applied to ${count} product${count === 1 ? "" : "s"}.`);
}

/** Resolves image file names from a CSV to files already in the media library. */
export async function lookupMedia(names: string[]): Promise<ActionResult<Record<string, string>>> {
  const ctx = await staff();
  if (!ctx) return fail("Staff access required.");
  const list = [...new Set(names)].filter((n) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(n)).slice(0, 2000);
  if (!list.length) return ok({});
  const { data, error } = await ctx.supabase.rpc("admin_media_lookup", { p_names: list });
  if (error) return fail(friendlyError(error));
  const map: Record<string, string> = {};
  for (const row of (data ?? []) as { name: string; path: string | null }[]) if (row.path) map[row.name] = row.path;
  return ok(map);
}

// --- Collections editor helpers ----------------------------------------------------------

export interface PickerProduct {
  id: string;
  title: string;
  status: string;
  image: string | null;
}

/** Products for the manual collection picker. */
export async function searchProductsForPicker(q: string): Promise<ActionResult<PickerProduct[]>> {
  const ctx = await staff();
  if (!ctx) return fail("Staff access required.");
  const { data, error } = await ctx.supabase.rpc("admin_product_list", { p: { q: q.slice(0, 100), limit: 20, sort: "title" } as Json });
  if (error) return fail(friendlyError(error));
  const rows = ((data as unknown as { rows: { id: string; title: string; state: string; image: string | null }[] })?.rows ?? []);
  return ok(rows.map((r) => ({ id: r.id, title: r.title, status: r.state, image: r.image })));
}

/** What an automated collection's rules would include right now. */
export async function previewCollectionRules(rules: { match: "all" | "any"; conditions: { field: string; op: string; value: string }[] }): Promise<
  ActionResult<{ count: number; live: number; products: PickerProduct[] }>
> {
  const ctx = await staff();
  if (!ctx) return fail("Staff access required.");
  const parsed = z.object({ match: z.enum(["all", "any"]), conditions: z.array(conditionSchema).max(20) }).safeParse(rules);
  if (!parsed.success) return ok({ count: 0, live: 0, products: [] });
  const { data, error } = await ctx.supabase.rpc("admin_collection_preview", { p_rules: parsed.data as unknown as Json });
  if (error) return fail(friendlyError(error));
  return ok(data as unknown as { count: number; live: number; products: PickerProduct[] });
}
