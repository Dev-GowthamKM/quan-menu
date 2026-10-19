import { AccessError, requireRole } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { HEADER, type Column } from "@/lib/product-csv";

export const dynamic = "force-dynamic";

const EXAMPLES: Partial<Record<Column, string>>[] = [
  {
    handle: "linen-wrap-dress", title: "Linen Wrap Dress", status: "active", brand: "Your Brand", category: "Women > Dresses",
    tags: "linen, summer", description: "A relaxed wrap dress in breathable linen.\n\nTie waist and patch pockets.",
    fabric: "100% linen", fit: "Relaxed fit", care: "Machine wash cold", price: "3490", compare_at_price: "4290",
    featured: "no", returnable: "yes", weight_grams: "420", sku: "LWD-OLV-S", size: "S", color: "Olive", color_hex: "#6b6b3a",
    stock: "12", image_urls: "linen-wrap-dress-front.jpg|https://example.com/images/linen-wrap-dress-back.jpg",
    image_alts: "Linen wrap dress in olive, front|Back view",
  },
  { handle: "linen-wrap-dress", sku: "LWD-OLV-M", size: "M", color: "Olive", color_hex: "#6b6b3a", stock: "15" },
  { handle: "linen-wrap-dress", sku: "LWD-OLV-L", size: "L", color: "Olive", color_hex: "#6b6b3a", stock: "8", variant_price: "3690" },
  {
    handle: "woven-cotton-stole", title: "Woven Cotton Stole", status: "draft", publish_at: "2026-11-15 10:00", brand: "Your Brand",
    category: "accessories", tags: "handloom", description: "Handwoven on a pit loom.", price: "1490", sku: "WCS-INDIGO",
    color: "Indigo", stock: "30", returnable: "no",
  },
];

/** A ready-to-fill CSV: every column, plus example rows to replace. */
export async function GET() {
  try {
    await requireRole("staff");
  } catch (e) {
    if (e instanceof AccessError) return new Response(e.message, { status: 403 });
    throw e;
  }
  return new Response(toCsv([HEADER, ...EXAMPLES.map((ex) => HEADER.map((h) => ex[h] ?? ""))]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="product-import-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
