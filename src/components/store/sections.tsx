import Link from "next/link";
import type { Brand, Collection, Department } from "@/lib/catalog";
import type { HeroSlide, ProductCard as Card, Promo } from "@/lib/types";
import CatalogImage from "../ui/CatalogImage";
import { buttonClass, cx } from "../ui/controls";
import { ArrowRight } from "../ui/icons";
import ProductCard from "./ProductCard";
import Rail from "./Rail";

export function SectionHeader({ eyebrow, title, href, linkLabel = "View all", className }: { eyebrow?: string; title: string; href?: string; linkLabel?: string; className?: string }) {
  return (
    <div className={cx("mb-8 flex items-end justify-between gap-6", className)}>
      <div>
        {eyebrow && <p className="label-caps text-stone">{eyebrow}</p>}
        <h2 className="mt-2 font-serif text-3xl leading-tight md:text-4xl">{title}</h2>
      </div>
      {href && (
        <Link href={href} className="group inline-flex shrink-0 items-center gap-2 text-[13px] tracking-wide underline-offset-4 hover:underline">
          {linkLabel} <ArrowRight size={16} className="transition group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}

export function Hero({ slide, storeName, tagline }: { slide?: HeroSlide; storeName: string; tagline: string }) {
  if (!slide) {
    return (
      <section className="container-page py-24 text-center md:py-36">
        <p className="label-caps text-stone">New season</p>
        <h1 className="mx-auto mt-6 max-w-4xl font-serif text-5xl leading-[1.05] md:text-7xl">{tagline || storeName}</h1>
        <div className="mt-10 flex justify-center gap-3">
          <Link href="/shop?sort=newest" className={buttonClass("primary", "lg")}>Shop new arrivals</Link>
        </div>
      </section>
    );
  }
  return (
    <section className="relative">
      <div className="grid md:grid-cols-2">
        <div className="relative order-1 aspect-[4/5] overflow-hidden bg-bone md:order-2 md:aspect-auto md:min-h-[min(88vh,56rem)]">
          <CatalogImage src={slide.image_url} alt={slide.image_alt || ""} fill priority sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
        </div>
        <div className="order-2 flex items-center bg-ivory md:order-1">
          <div className="w-full px-6 py-14 md:px-12 lg:px-20 xl:px-28">
            {slide.eyebrow && <p className="label-caps animate-fade-in text-stone">{slide.eyebrow}</p>}
            <h1 className="mt-5 animate-fade-in font-serif text-5xl leading-[1.02] [animation-delay:80ms] md:text-6xl xl:text-[5.5rem]">{slide.heading}</h1>
            {slide.subheading && <p className="mt-6 max-w-md animate-fade-in leading-relaxed text-taupe [animation-delay:160ms]">{slide.subheading}</p>}
            <div className="mt-10 flex animate-fade-in flex-wrap gap-3 [animation-delay:240ms]">
              {slide.cta_href && <Link href={slide.cta_href} className={buttonClass("primary", "lg")}>{slide.cta_label || "Shop now"}</Link>}
              {slide.secondary_href && <Link href={slide.secondary_href} className={buttonClass("secondary", "lg")}>{slide.secondary_label || "Explore"}</Link>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function DepartmentTiles({ departments }: { departments: Department[] }) {
  if (!departments.length) return null;
  return (
    <section className="container-page mt-20 md:mt-28">
      <SectionHeader eyebrow="Shop by department" title="Find your fit" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
        {departments.map((d, i) => (
          <Link key={d.id} href={`/category/${d.slug}`} className="group relative block aspect-[3/4] overflow-hidden bg-bone">
            <CatalogImage src={d.image_url} alt={d.name} fill sizes="(min-width: 768px) 25vw, 50vw" priority={i < 2} className="object-cover transition duration-700 ease-out group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/0 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-4 text-white md:p-6">
              <p className="font-serif text-2xl md:text-3xl">{d.name}</p>
              <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] tracking-[0.16em] uppercase opacity-90">
                Shop now <ArrowRight size={14} />
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function ProductRail({ eyebrow, title, href, products }: { eyebrow?: string; title: string; href?: string; products: Card[] }) {
  if (!products.length) return null;
  return (
    <section className="container-page mt-20 md:mt-28">
      <SectionHeader eyebrow={eyebrow} title={title} href={href} />
      <Rail label={title}>
        {products.map((p) => (
          <ProductCard key={p.id} product={p} className="w-[46vw] shrink-0 snap-start sm:w-[32vw] md:w-[23vw] xl:w-[19rem]" sizes="(min-width: 1280px) 19rem, (min-width: 768px) 23vw, 46vw" />
        ))}
      </Rail>
    </section>
  );
}

export function ProductGrid({ products, priorityCount = 0 }: { products: Card[]; priorityCount?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-10 md:grid-cols-3 md:gap-x-5 xl:grid-cols-4">
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} priority={i < priorityCount} />
      ))}
    </div>
  );
}

export function PromoGrid({ promos }: { promos?: Promo[] }) {
  if (!promos?.length) return null;
  return (
    <section className="container-page mt-20 md:mt-28">
      <div className={cx("grid gap-3 md:gap-5", promos.length >= 3 ? "md:grid-cols-3" : promos.length === 2 ? "md:grid-cols-2" : "")}>
        {promos.slice(0, 3).map((p) => (
          <Link key={p.heading} href={p.cta_href || "/shop"} className="group relative block aspect-[4/5] overflow-hidden bg-bone">
            <CatalogImage src={p.image_url} alt={p.image_alt || p.heading} fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover transition duration-700 ease-out group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 text-white md:p-8">
              {p.eyebrow && <p className="label-caps opacity-90">{p.eyebrow}</p>}
              <p className="mt-2 font-serif text-3xl leading-tight">{p.heading}</p>
              {p.cta_label && (
                <span className="mt-4 inline-flex items-center gap-2 border-b border-white/70 pb-0.5 text-[11px] tracking-[0.16em] uppercase">
                  {p.cta_label} <ArrowRight size={14} />
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function SeasonalFeature({ collection }: { collection?: Collection }) {
  if (!collection?.banner_url) return null;
  return (
    <section className="mt-20 md:mt-28">
      <Link href={`/collections/${collection.slug}`} className="group relative block h-[70vh] min-h-[26rem] overflow-hidden bg-bone md:h-[80vh]">
        <CatalogImage src={collection.banner_url} alt={collection.title} fill sizes="100vw" className="object-cover transition duration-[1.5s] ease-out group-hover:scale-[1.03]" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/20 to-transparent" />
        <div className="container-page absolute inset-0 flex items-end pb-14 md:items-center md:pb-0">
          <div className="max-w-lg text-white">
            <p className="label-caps opacity-90">{collection.season || "The season"}</p>
            <h2 className="mt-4 font-serif text-5xl leading-none md:text-7xl">{collection.title}</h2>
            {collection.description && <p className="mt-5 leading-relaxed opacity-90">{collection.description}</p>}
            <span className="mt-8 inline-flex h-12 items-center gap-2 bg-ivory px-7 text-[12px] tracking-[0.16em] text-ink uppercase">
              Explore the collection <ArrowRight size={14} />
            </span>
          </div>
        </div>
      </Link>
    </section>
  );
}

export function CollectionCards({ collections, title = "Trending collections" }: { collections: Collection[]; title?: string }) {
  if (!collections.length) return null;
  return (
    <section className="container-page mt-20 md:mt-28">
      <SectionHeader eyebrow="Curated" title={title} href="/collections" />
      <Rail label={title}>
        {collections.map((c) => (
          <Link key={c.id} href={`/collections/${c.slug}`} className="group w-[70vw] shrink-0 snap-start sm:w-[40vw] md:w-[28vw] xl:w-[22rem]">
            <div className="relative aspect-[3/4] overflow-hidden bg-bone">
              <CatalogImage src={c.image_url || c.banner_url} alt={c.title} fill sizes="(min-width: 1280px) 22rem, (min-width: 768px) 28vw, 70vw" className="object-cover transition duration-700 ease-out group-hover:scale-105" />
            </div>
            <p className="mt-4 font-serif text-2xl">{c.title}</p>
            {c.description && <p className="mt-1 line-clamp-2 text-sm text-taupe">{c.description}</p>}
          </Link>
        ))}
      </Rail>
    </section>
  );
}

export function BrandStrip({ brands }: { brands: Brand[] }) {
  if (!brands.length) return null;
  return (
    <section className="container-page mt-20 md:mt-28">
      <SectionHeader eyebrow="Featured brands" title="The makers" href="/brands" linkLabel="All brands" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5 lg:grid-cols-5">
        {brands.slice(0, 5).map((b) => (
          <Link key={b.id} href={`/brands/${b.slug}`} className="group relative block aspect-[4/5] overflow-hidden bg-ink">
            <CatalogImage src={b.banner_url} alt="" fill sizes="(min-width: 1024px) 20vw, (min-width: 768px) 33vw, 50vw" className="object-cover opacity-70 transition duration-700 ease-out group-hover:scale-105 group-hover:opacity-60" />
            <div className="absolute inset-0 grid place-items-center p-4 text-center">
              <span className="font-serif text-2xl text-white md:text-3xl">{b.name}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function CampaignBand({ slide }: { slide: HeroSlide }) {
  return (
    <section className="container-page mt-20 md:mt-28">
      <div className="grid items-center gap-8 bg-paper md:grid-cols-2 md:gap-0">
        <div className="relative aspect-[4/5] overflow-hidden bg-bone">
          <CatalogImage src={slide.image_url} alt={slide.image_alt || ""} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
        </div>
        <div className="px-6 pb-10 md:px-16 md:py-16">
          {slide.eyebrow && <p className="label-caps text-stone">{slide.eyebrow}</p>}
          <h2 className="mt-4 font-serif text-4xl leading-tight md:text-6xl">{slide.heading}</h2>
          {slide.subheading && <p className="mt-5 max-w-md leading-relaxed text-taupe">{slide.subheading}</p>}
          {slide.cta_href && <Link href={slide.cta_href} className={buttonClass("secondary", "lg", "mt-8")}>{slide.cta_label || "Discover"}</Link>}
        </div>
      </div>
    </section>
  );
}
