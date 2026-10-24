import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductLayout from "@/components/store/product/ProductLayout";
import { getProductPage, getRelatedProducts, getReviews } from "@/lib/catalog";
import { excerpt } from "@/lib/seo";
import { getSettings } from "@/lib/settings";
import { contextOrigin } from "@/lib/store";

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductPage(slug);
  if (!product) return { title: "Product not found" };
  const title = product.seo_title || `${product.title}${product.brand ? ` by ${product.brand.name}` : ""}`;
  const description = product.seo_description || excerpt(product.description);
  const image = product.images[0]?.url;
  return {
    title,
    description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: { type: "website", title, description, url: `/products/${product.slug}`, images: image ? [{ url: image, alt: product.images[0].alt || product.title }] : undefined },
    twitter: { card: "summary_large_image", title, description, images: image ? [image] : undefined },
  };
}

export default async function ProductRoute({ params }: Props) {
  const { slug } = await params;
  const product = await getProductPage(slug);
  if (!product) notFound();
  const [settings, related, reviews, origin] = await Promise.all([getSettings(), getRelatedProducts(product.id, 8), getReviews(product.id), contextOrigin()]);
  return <ProductLayout origin={origin} product={product} settings={settings} related={related} reviews={reviews} />;
}

