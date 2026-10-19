import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductListing, { categoryLinks } from "@/components/store/listing/ProductListing";
import { getBrand } from "@/lib/catalog";
import { listingCanonical, listingQuery, parseListing, type RawParams } from "@/lib/listing";
import { excerpt } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<RawParams> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const brand = await getBrand(slug);
  if (!brand) return {};
  return {
    title: brand.seo_title || brand.name,
    description: brand.seo_description || excerpt(brand.description) || `Shop ${brand.name}.`,
    alternates: { canonical: listingCanonical(`/brands/${slug}`, parseListing(await searchParams)) },
    openGraph: { images: brand.banner_url ? [brand.banner_url] : undefined },
  };
}

export default async function BrandPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const raw = await searchParams;
  const brand = await getBrand(slug);
  if (!brand) notFound();
  const listing = parseListing(raw);
  return (
    <ProductListing
      title={brand.name}
      eyebrow="The brand"
      description={brand.description}
      banner={brand.banner_url}
      crumbs={[{ name: "Home", href: "/" }, { name: "Brands", href: "/brands" }, { name: brand.name }]}
      basePath={`/brands/${slug}`}
      scope={{ brands: [slug] }}
      params={listing}
      raw={raw}
      hide={["brand"]}
      categories={await categoryLinks(listing.category, (s) => `/brands/${slug}${listingQuery({ category: s })}`)}
    />
  );
}
