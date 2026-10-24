import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { contextOrigin } from "@/lib/store";
import { supabaseServer } from "@/lib/supabase/server";
import type { ProductPage } from "@/lib/types";
import ProductLayout from "@/components/store/product/ProductLayout";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Preview", robots: { index: false, follow: false } };

/** Staff preview of drafts and scheduled products (row-level security lets staff read them). */
export default async function ProductPreview({ params }: { params: Promise<{ slug: string }> }) {
  await requireStaffPage();
  const { slug } = await params;
  const { data } = await (await supabaseServer()).rpc("get_product_page", { p_slug: slug });
  const product = data as unknown as ProductPage | null;
  if (!product) notFound();
  const [settings, origin] = await Promise.all([getSettings(), contextOrigin()]);
  const preview = product.status !== "active" || !product.published_at || new Date(product.published_at) > new Date();
  return <ProductLayout origin={origin} product={product} settings={settings} related={[]} reviews={[]} preview={preview} />;
}
