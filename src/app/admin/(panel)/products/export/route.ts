import { AccessError, requireRole } from "@/lib/auth";
import { categoryOptions } from "@/lib/admin-data";
import { sqlNull } from "@/lib/db";
import { toCsv } from "@/lib/csv";
import type { Json } from "@/lib/database.types";
import { fromMinor } from "@/lib/money";
import { HEADER, type Column } from "@/lib/product-csv";

export const dynamic = "force-dynamic";

const yesNo = (b: boolean) => (b ? "yes" : "no");
const cmOf = (mm: number | null) => (mm === null ? "" : String(mm / 10));

/** Products matching the list filters as CSV, one row per variant (the import format). */
export async function GET(req: Request) {
  let ctx;
  try {
    ctx = await requireRole("staff");
  } catch (e) {
    if (e instanceof AccessError) return new Response(e.message, { status: 403 });
    throw e;
  }
  const sb = ctx.supabase;
  const q = new URL(req.url).searchParams;
  const filters = Object.fromEntries(["q", "status", "brand", "category", "stock"].map((k) => [k, q.get(k) ?? ""]));
  const { data: idData, error } = await sb.rpc("admin_product_list", { p: { ...filters, ids_only: true } as Json });
  if (error) return new Response(error.message, { status: 500 });
  const ids = (idData ?? []) as string[];

  const categories = await categoryOptions(sb);
  const categoryPath = new Map(categories.map((c) => [c.id, c.path.replace(/ › /g, " > ")]));
  const rows: unknown[][] = [HEADER];

  for (let i = 0; i < ids.length; i += 200) {
    const { data, error: e2 } = await sb
      .from("products")
      .select(
        `id, title, slug, status, published_at, tags, description, fabric, fit, care, price, compare_at_price, tax_rate_bps, is_featured,
         is_returnable, return_window_days, weight_grams, length_mm, width_mm, height_mm, seo_title, seo_description, category_id,
         brand:brands(name),
         variants:product_variants(sku, size, color, color_hex, price, compare_at_price, stock_quantity, barcode, weight_grams, low_stock_threshold, is_active, position),
         images:product_images(url, alt, position),
         collections:collection_products(collection:collections(slug, kind))`,
      )
      .in("id", ids.slice(i, i + 200));
    if (e2) return new Response(e2.message, { status: 500 });
    const order = new Map(ids.map((id, n) => [id, n]));
    for (const p of (data ?? []).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))) {
      const images = [...(p.images ?? [])].sort((a, b) => a.position - b.position);
      const variants = [...(p.variants ?? [])].sort((a, b) => a.position - b.position);
      const collections = (p.collections ?? []).map((c) => c.collection).filter((c) => c && c.kind === "manual").map((c) => c!.slug);
      const scheduled = p.status === "active" && p.published_at && new Date(p.published_at) > new Date();
      variants.forEach((v, n) => {
        const first = n === 0;
        const row: Record<Column, unknown> = {
          handle: p.slug,
          title: first ? p.title : "",
          status: first ? p.status : "",
          publish_at: first && scheduled ? p.published_at : "",
          brand: first ? p.brand?.name ?? "" : "",
          category: first && p.category_id ? categoryPath.get(p.category_id) ?? "" : "",
          tags: first ? p.tags.join(", ") : "",
          collections: first ? collections.join("|") : "",
          description: first ? p.description : "",
          fabric: first ? p.fabric : "",
          fit: first ? p.fit : "",
          care: first ? p.care : "",
          price: first ? fromMinor(p.price) : "",
          compare_at_price: first ? fromMinor(p.compare_at_price) : "",
          tax_rate: first && p.tax_rate_bps !== null ? p.tax_rate_bps / 100 : "",
          featured: first ? yesNo(p.is_featured) : "",
          returnable: first ? yesNo(p.is_returnable) : "",
          return_window_days: first ? p.return_window_days ?? "" : "",
          weight_grams: first ? p.weight_grams ?? "" : "",
          length_cm: first ? cmOf(p.length_mm) : "",
          width_cm: first ? cmOf(p.width_mm) : "",
          height_cm: first ? cmOf(p.height_mm) : "",
          seo_title: first ? p.seo_title : "",
          seo_description: first ? p.seo_description : "",
          sku: v.sku,
          size: v.size,
          color: v.color,
          color_hex: v.color_hex ?? "",
          variant_price: fromMinor(v.price),
          variant_compare_at_price: fromMinor(v.compare_at_price),
          stock: v.stock_quantity,
          barcode: v.barcode ?? "",
          variant_weight_grams: v.weight_grams ?? "",
          low_stock_alert: v.low_stock_threshold ?? "",
          variant_active: yesNo(v.is_active),
          image_urls: first ? images.map((im) => im.url).join("|") : "",
          image_alts: first ? images.map((im) => im.alt.replace(/\|/g, "/")).join("|") : "",
        };
        rows.push(HEADER.map((h) => row[h]));
      });
    }
  }

  await sb.rpc("log_admin_action", { p_action: "export", p_entity_type: "products", p_entity_id: sqlNull<string>(null), p_details: { count: ids.length, filters } as Json });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="products-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
