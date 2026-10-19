import { Suspense } from "react";
import { getRelatedProducts, getReviews } from "@/lib/catalog";
import { absoluteUrl, excerpt, jsonLd } from "@/lib/seo";
import { getSettings, policiesOf } from "@/lib/settings";
import type { ProductPage } from "@/lib/types";
import { Breadcrumbs } from "../listing/ProductListing";
import RecentlyViewed from "../RecentlyViewed";
import { ProductRail } from "../sections";
import ProductDetails from "./ProductDetails";
import ProductView from "./ProductView";
import Reviews from "./Reviews";

function productJsonLd(product: ProductPage, currency: string) {
  const offers = product.variants.map((v) => ({
    "@type": "Offer",
    sku: v.sku,
    price: (v.price / 100).toFixed(2),
    priceCurrency: currency,
    availability: v.available > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    itemCondition: "https://schema.org/NewCondition",
    url: absoluteUrl(`/products/${product.slug}${v.color ? `?color=${encodeURIComponent(v.color)}` : ""}`),
  }));
  return [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.title,
      description: excerpt(product.description, 500),
      image: product.images.map((i) => i.url),
      sku: product.variants[0]?.sku,
      brand: product.brand ? { "@type": "Brand", name: product.brand.name } : undefined,
      material: product.fabric || undefined,
      color: [...new Set(product.variants.map((v) => v.color).filter(Boolean))].join(", ") || undefined,
      offers:
        offers.length > 1
          ? {
              "@type": "AggregateOffer",
              priceCurrency: currency,
              lowPrice: (product.min_price / 100).toFixed(2),
              highPrice: (product.max_price / 100).toFixed(2),
              offerCount: offers.length,
              availability: product.available_stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
              offers,
            }
          : offers[0],
      aggregateRating:
        product.rating_count > 0
          ? { "@type": "AggregateRating", ratingValue: Number(product.rating_avg).toFixed(1), reviewCount: product.rating_count }
          : undefined,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { name: "Home", item: absoluteUrl("/") },
        ...product.breadcrumbs.map((c) => ({ name: c.name, item: absoluteUrl(`/category/${c.slug}`) })),
        { name: product.title, item: absoluteUrl(`/products/${product.slug}`) },
      ].map((x, i) => ({ "@type": "ListItem", position: i + 1, ...x })),
    },
  ];
}

export default function ProductLayout({
  product,
  settings,
  related,
  reviews,
  preview,
}: {
  product: ProductPage;
  settings: Awaited<ReturnType<typeof getSettings>>;
  related: Awaited<ReturnType<typeof getRelatedProducts>>;
  reviews: Awaited<ReturnType<typeof getReviews>>;
  preview?: boolean;
}) {
  const shipping = policiesOf(settings).shipping?.split(/\n{2,}/).slice(0, 2).join("\n\n") ?? "";
  return (
    <>
      {!preview && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(productJsonLd(product, settings.currency)) }} />}
      <div className="container-page pt-6 md:pt-8">
        <Breadcrumbs
          items={[
            { name: "Home", href: "/" },
            ...product.breadcrumbs.map((c) => ({ name: c.name, href: `/category/${c.slug}` })),
            { name: product.title },
          ]}
        />
        <div className="mt-6">
          <Suspense>
            <ProductView product={product} currency={settings.currency} preview={preview} />
          </Suspense>
        </div>
        <div className="mt-16 grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-14 xl:gap-20">
          <div className="lg:col-start-2">
            <ProductDetails product={product} shippingNote={shipping} />
          </div>
        </div>
      </div>
      <Reviews productId={product.id} reviews={reviews} enabled={settings.reviews_enabled && !preview} />
      <ProductRail eyebrow="You may also like" title="Complete the look" products={related} />
      <RecentlyViewed title="Recently viewed" excludeId={product.id} />
    </>
  );
}
