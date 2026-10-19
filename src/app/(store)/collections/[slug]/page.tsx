import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductListing from "@/components/store/listing/ProductListing";
import { getCollection } from "@/lib/catalog";
import { listingCanonical, parseListing, type RawParams } from "@/lib/listing";
import { excerpt } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<RawParams> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const c = await getCollection(slug);
  if (!c) return {};
  return {
    title: c.seo_title || c.title,
    description: c.seo_description || excerpt(c.description),
    alternates: { canonical: listingCanonical(`/collections/${slug}`, parseListing(await searchParams)) },
    openGraph: { images: c.banner_url ? [c.banner_url] : undefined },
  };
}

export default async function CollectionPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const raw = await searchParams;
  const c = await getCollection(slug);
  if (!c) notFound();
  const listing = parseListing(raw);
  // A collection's own order is its "featured" sort.
  if (!raw.sort && c.product_sort !== "manual") {
    listing.sort = c.product_sort === "best_selling" ? "popular" : (c.product_sort as typeof listing.sort);
  }
  return (
    <ProductListing
      title={c.title}
      eyebrow={c.is_seasonal ? c.season || "Seasonal collection" : "Collection"}
      description={c.description}
      banner={c.banner_url}
      crumbs={[{ name: "Home", href: "/" }, { name: "Collections", href: "/collections" }, { name: c.title }]}
      basePath={`/collections/${slug}`}
      scope={{ collection: slug }}
      params={listing}
      raw={raw}
    />
  );
}
