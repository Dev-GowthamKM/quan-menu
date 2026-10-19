import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductListing, { categoryLinks } from "@/components/store/listing/ProductListing";
import { getCategory } from "@/lib/catalog";
import { listingCanonical, parseListing, type RawParams } from "@/lib/listing";
import { excerpt } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<RawParams> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const found = await getCategory(slug);
  if (!found) return {};
  const { category, parent } = found;
  const title = category.seo_title || (parent ? `${parent.name}'s ${category.name}` : `${category.name}'s clothing`);
  return {
    title,
    description: category.seo_description || excerpt(category.description) || `Shop ${category.name.toLowerCase()} from independent labels.`,
    alternates: { canonical: listingCanonical(`/category/${slug}`, parseListing(await searchParams)) },
    openGraph: { images: category.banner_url || category.image_url ? [category.banner_url || category.image_url!] : undefined },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const raw = await searchParams;
  const found = await getCategory(slug);
  if (!found) notFound();
  const { category, parent } = found;
  const crumbs = [{ name: "Home", href: "/" }, ...(parent ? [{ name: parent.name, href: `/category/${parent.slug}` }] : []), { name: category.name }];

  return (
    <ProductListing
      title={category.name}
      eyebrow={parent ? parent.name : "Shop"}
      description={category.description}
      banner={!parent ? category.banner_url : null}
      crumbs={crumbs}
      basePath={`/category/${slug}`}
      scope={{ category: slug }}
      params={parseListing(raw)}
      raw={raw}
      categories={await categoryLinks(slug, (s) => `/category/${s}`)}
    />
  );
}
