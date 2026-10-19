import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/store/listing/ProductListing";
import CatalogImage from "@/components/ui/CatalogImage";
import { getBrands } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Brands",
  description: "The independent labels and artisan studios we work with.",
  alternates: { canonical: "/brands" },
};

export default async function BrandsPage() {
  const brands = await getBrands();
  const byLetter = new Map<string, typeof brands>();
  for (const b of [...brands].sort((a, z) => a.name.localeCompare(z.name))) {
    const letter = /[a-z]/i.test(b.name[0]) ? b.name[0].toUpperCase() : "#";
    byLetter.set(letter, [...(byLetter.get(letter) ?? []), b]);
  }
  return (
    <div className="container-page pt-8 md:pt-12">
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Brands" }]} />
      <h1 className="mt-6 font-serif text-5xl md:text-6xl">The makers</h1>
      <p className="mt-4 max-w-2xl leading-relaxed text-taupe">
        Independent labels and artisan studios, chosen for how carefully they make things.
      </p>
      <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {brands.map((b) => (
          <Link key={b.id} href={`/brands/${b.slug}`} className="group block">
            <div className="relative aspect-[16/10] overflow-hidden bg-ink">
              {b.banner_url && (
                <CatalogImage src={b.banner_url} alt="" fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover opacity-75 transition duration-700 group-hover:scale-105 group-hover:opacity-65" />
              )}
              <span className="absolute inset-0 grid place-items-center font-serif text-3xl text-white">{b.name}</span>
            </div>
            {b.description && <p className="mt-3 line-clamp-2 text-sm text-taupe">{b.description}</p>}
          </Link>
        ))}
      </div>
      {brands.length > 0 && (
        <section className="mt-20 border-t border-line pt-10">
          <h2 className="label-caps text-stone">A–Z</h2>
          <div className="mt-6 grid gap-8 sm:grid-cols-3 lg:grid-cols-6">
            {[...byLetter.entries()].map(([letter, list]) => (
              <div key={letter}>
                <p className="font-serif text-3xl">{letter}</p>
                <ul className="mt-2 grid gap-1.5 text-sm">
                  {list.map((b) => (
                    <li key={b.id}><Link href={`/brands/${b.slug}`} className="hover:underline">{b.name}</Link></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
      {brands.length === 0 && <p className="mt-16 text-taupe">No brands yet.</p>}
    </div>
  );
}
