import type { Metadata } from "next";
import ProductListing, { categoryLinks } from "@/components/store/listing/ProductListing";
import { getCategory } from "@/lib/catalog";
import { listingCanonical, listingQuery, parseListing, type RawParams } from "@/lib/listing";

type Props = { searchParams: Promise<RawParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = parseListing(await searchParams);
  if (params.q) return { title: `Search: ${params.q}`, robots: { index: false, follow: true } };
  return {
    title: params.onSale ? "Sale" : "Shop all",
    description: "Browse womenswear, menswear, unisex essentials and accessories from independent labels.",
    alternates: { canonical: listingCanonical("/shop", params) },
  };
}

export default async function ShopPage({ searchParams }: Props) {
  const raw = await searchParams;
  const params = parseListing(raw);
  const category = params.category ? await getCategory(params.category) : null;
  const title = params.q ? `“${params.q}”` : params.onSale ? "Sale" : category ? category.category.name : params.sort === "newest" ? "New arrivals" : "Shop all";
  const categories = await categoryLinks(params.category, (slug) => `/shop${listingQuery({ q: params.q, category: slug })}`);

  return (
    <ProductListing
      title={title}
      eyebrow={params.q ? "Search results" : undefined}
      crumbs={[{ name: "Home", href: "/" }, { name: params.q ? "Search" : "Shop", href: "/shop" }]}
      basePath="/shop"
      scope={{}}
      params={params}
      raw={raw}
      categories={categories}
    />
  );
}
