import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/store/listing/ProductListing";
import CatalogImage from "@/components/ui/CatalogImage";
import { getCollections } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Collections",
  description: "Seasonal collections and curated edits.",
  alternates: { canonical: "/collections" },
};

export default async function CollectionsPage() {
  const collections = await getCollections();
  const seasonal = collections.filter((c) => c.is_seasonal);
  const edits = collections.filter((c) => !c.is_seasonal);
  return (
    <div className="container-page pt-8 md:pt-12">
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Collections" }]} />
      <h1 className="mt-6 font-serif text-5xl md:text-6xl">Collections</h1>
      <p className="mt-4 max-w-2xl leading-relaxed text-taupe">Seasonal stories and curated edits from across the store.</p>

      {seasonal.length > 0 && (
        <section className="mt-12">
          <h2 className="label-caps text-stone">Seasonal</h2>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {seasonal.map((c) => (
              <Link key={c.id} href={`/collections/${c.slug}`} className="group relative block aspect-[16/10] overflow-hidden bg-bone">
                <CatalogImage src={c.banner_url || c.image_url} alt="" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover transition duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-6 text-white md:p-8">
                  <p className="label-caps opacity-90">{c.season}</p>
                  <p className="mt-2 font-serif text-4xl">{c.title}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-16">
        <h2 className="label-caps text-stone">Edits</h2>
        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
          {edits.map((c) => (
            <Link key={c.id} href={`/collections/${c.slug}`} className="group block">
              <div className="relative aspect-[3/4] overflow-hidden bg-bone">
                <CatalogImage src={c.image_url || c.banner_url} alt="" fill sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw" className="object-cover transition duration-700 group-hover:scale-105" />
              </div>
              <p className="mt-4 font-serif text-2xl">{c.title}</p>
              {c.description && <p className="mt-1 line-clamp-2 text-sm text-taupe">{c.description}</p>}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
