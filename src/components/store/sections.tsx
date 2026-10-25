import Link from "next/link";
import type { Brand, Collection, Department } from "@/lib/catalog";
import type { DepartmentStyle, DesignKey } from "@/lib/designs";
import { formatMoney } from "@/lib/money";
import { excerpt } from "@/lib/seo";
import { policiesOf, type Settings } from "@/lib/settings";
import type { HeroSlide, ProductCard as Card, Promo } from "@/lib/types";
import { safeHref } from "@/lib/urls";
import CatalogImage from "../ui/CatalogImage";
import { buttonClass, cx } from "../ui/controls";
import { ArrowRight, CardIcon, ReturnIcon, ShieldIcon, TruckIcon } from "../ui/icons";
import DepartmentList from "./DepartmentList";
import NewsletterForm from "./NewsletterForm";
import ProductCard from "./ProductCard";
import Rail from "./Rail";
import { SectionHeader } from "./SectionHeader";

export { SectionHeader };

/** Departments, in the design's department style. */
export function Departments({ departments, variant }: { departments: Department[]; variant: DepartmentStyle }) {
  if (!departments.length) return null;
  const image = (d: Department, sizes: string, className = "", priority = false) => (
    <CatalogImage src={d.image_url} alt={d.name} fill sizes={sizes} priority={priority} className={cx("object-cover transition duration-700 ease-out", className)} />
  );

  switch (variant) {
    case "list":
      return (
        <section className="container-page mt-20 md:mt-28">
          <SectionHeader title="Shop by department" />
          <DepartmentList departments={departments} />
        </section>
      );

    case "chips":
      return (
        <section className="container-page mt-10 md:mt-14">
          <ul className="scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
            {departments.map((d, i) => (
              <li key={d.id} className="w-[64vw] shrink-0 snap-start sm:w-[40vw] lg:w-auto" data-reveal>
                <Link
                  href={`/category/${d.slug}`}
                  className={cx(
                    "group flex items-center gap-4 rounded-card border-2 border-ink p-3 transition hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_var(--color-ink)]",
                    ["bg-brand text-on-brand", "bg-sand", "bg-paper"][i % 3],
                  )}
                >
                  <span className="relative size-16 shrink-0 overflow-hidden rounded-full border-2 border-current bg-bone">{image(d, "64px", "", i < 2)}</span>
                  <span className="min-w-0">
                    <span className="block font-serif text-xl leading-none">{d.name}</span>
                    <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold tracking-wider uppercase">Shop now <ArrowRight size={12} /></span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      );

    case "circles":
      return (
        <section className="container-page mt-14 md:mt-20">
          <SectionHeader eyebrow="Shop by department" title="Find your fit" />
          <ul className="scrollbar-none -mx-4 flex gap-5 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 md:justify-center md:gap-10 lg:mx-0 lg:px-0">
            {departments.map((d, i) => (
              <li key={d.id} className="shrink-0" data-reveal>
                <Link href={`/category/${d.slug}`} className="group grid w-24 justify-items-center gap-3 text-center md:w-32">
                  <span className="block size-24 rounded-full bg-gradient-to-tr from-accent to-brand p-[3px] md:size-32">
                    <span className="relative block size-full overflow-hidden rounded-full border-[3px] border-ivory bg-bone">{image(d, "128px", "group-hover:scale-105", i < 4)}</span>
                  </span>
                  <span className="text-sm font-medium">{d.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      );

    case "arches":
      return (
        <section className="container-page mt-20 md:mt-28">
          <SectionHeader eyebrow="Shop by department" title="Find your fit" />
          <ul className="grid grid-cols-2 gap-5 md:grid-cols-4 md:gap-8">
            {departments.map((d, i) => (
              <li key={d.id} data-reveal>
                <Link href={`/category/${d.slug}`} className="group block text-center">
                  <span className="block aspect-[3/4] rounded-t-full border border-accent p-1.5">
                    <span className="relative block size-full overflow-hidden rounded-t-full bg-bone">{image(d, "(min-width: 768px) 25vw, 50vw", "group-hover:scale-105", i < 2)}</span>
                  </span>
                  <span className="mt-4 block font-serif text-lg tracking-[0.12em] uppercase">{d.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      );

    case "panels":
      return (
        <section className="mt-20 md:mt-28">
          <div className="container-page">
            <SectionHeader eyebrow="Explore" title="Departments" />
          </div>
          <ul className="grid gap-3 md:gap-4">
            {departments.slice(0, 4).map((d, i) => (
              <li key={d.id} data-reveal>
                <Link href={`/category/${d.slug}`} className="group relative block h-[56svh] min-h-80 overflow-hidden bg-bone md:h-[72svh]">
                  <CatalogImage src={d.image_url} alt={d.name} fill sizes="100vw" priority={i === 0} className="object-cover transition duration-[1.6s] ease-out group-hover:scale-[1.04]" data-parallax="0.1" />
                  <span className="absolute inset-0 bg-black/25 transition-colors duration-700 group-hover:bg-black/35" />
                  <span className="absolute inset-0 grid place-items-center px-6 text-center text-white">
                    <span>
                      <span className="block text-[11px] tracking-[0.35em] uppercase opacity-90">{String(i + 1).padStart(2, "0")}</span>
                      <span className="mt-3 block font-serif text-5xl leading-none md:text-7xl">{d.name}</span>
                      <span className="mt-5 inline-block border-b border-white/70 pb-0.5 text-[11px] tracking-[0.3em] uppercase">Explore</span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      );

    case "lineup":
      return (
        <section className="container-page mt-20 md:mt-28">
          <SectionHeader eyebrow="The range" title="Departments" />
          <ul className="scrollbar-none -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pt-2 pb-8 sm:-mx-6 sm:px-6 lg:mx-0 lg:justify-center lg:px-0">
            {departments.map((d, i) => (
              <li key={d.id} className="w-[42vw] shrink-0 snap-center sm:w-[28vw] lg:w-52" data-reveal>
                <Link href={`/category/${d.slug}`} className="group block text-center">
                  <span className="relative block aspect-[9/16] overflow-hidden rounded-full border border-line bg-bone transition duration-500 group-hover:-translate-y-2 group-hover:shadow-[0_24px_70px_-20px_var(--color-brand)]">
                    {image(d, "(min-width: 1024px) 13rem, 42vw", "group-hover:scale-105", i < 3)}
                    <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                    <span className="absolute inset-x-3 bottom-10 font-serif text-xl leading-tight text-white uppercase">{d.name}</span>
                  </span>
                  <span aria-hidden className="mx-auto mt-3 block h-5 w-3/4 rounded-[50%] bg-brand/30 blur-xl transition-colors group-hover:bg-brand/60" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      );

    case "mosaic":
      if (departments.length >= 3) {
        return (
          <section className="container-page mt-20 md:mt-28">
            <SectionHeader title="Departments" />
            <ul className="grid gap-3 md:h-[44rem] md:grid-cols-4 md:grid-rows-2 md:gap-4">
              {departments.slice(0, 5).map((d, i) => (
                <li key={d.id} data-reveal className={cx("relative aspect-[4/3] overflow-hidden rounded-img bg-bone md:aspect-auto", i === 0 && "md:col-span-2 md:row-span-2", i === 1 && departments.length < 5 && "md:col-span-2")}>
                  <Link href={`/category/${d.slug}`} className="group absolute inset-0 block">
                    {image(d, i === 0 ? "(min-width: 768px) 50vw, 100vw" : "(min-width: 768px) 25vw, 100vw", "duration-1000 group-hover:scale-105", i < 2)}
                    <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                    <span className="absolute bottom-0 left-0 p-5 text-white md:p-7">
                      <span className={cx("block font-serif leading-none uppercase", i === 0 ? "text-4xl md:text-6xl" : "text-3xl")}>{d.name}</span>
                      <span className="mt-3 inline-flex items-center gap-2 text-[11px] tracking-[0.3em] uppercase">Discover <ArrowRight size={14} /></span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      }
      return <Departments departments={departments} variant="tiles" />;

    default:
      return (
        <section className="container-page mt-20 md:mt-28">
          <SectionHeader eyebrow="Shop by department" title="Find your fit" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
            {departments.map((d, i) => (
              <Link key={d.id} href={`/category/${d.slug}`} className="group relative block aspect-[3/4] overflow-hidden rounded-img bg-bone" data-reveal>
                {image(d, "(min-width: 768px) 25vw, 50vw", "group-hover:scale-105", i < 2)}
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
          <Link key={p.heading} href={safeHref(p.cta_href) ?? "/shop"} className="group relative block aspect-[4/5] overflow-hidden rounded-img bg-bone" data-reveal>
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
        <CatalogImage src={collection.banner_url} alt={collection.title} fill sizes="100vw" className="object-cover transition duration-[1.5s] ease-out group-hover:scale-[1.03]" data-parallax="0.12" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/20 to-transparent" />
        <div className="container-page absolute inset-0 flex items-end pb-14 md:items-center md:pb-0">
          <div className="max-w-lg text-white" data-reveal>
            <p className="label-caps opacity-90">{collection.season || "The season"}</p>
            <h2 className="mt-4 font-serif text-5xl leading-none md:text-7xl">{collection.title}</h2>
            {collection.description && <p className="mt-5 leading-relaxed opacity-90">{collection.description}</p>}
            <span className="mt-8 inline-flex h-12 items-center gap-2 rounded-btn bg-white px-7 text-[12px] tracking-[0.16em] text-black uppercase">
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
          <Link key={c.id} href={`/collections/${c.slug}`} className="group w-[70vw] shrink-0 snap-start sm:w-[40vw] md:w-[28vw] xl:w-[22rem]" data-reveal>
            <div className="relative aspect-[3/4] overflow-hidden rounded-img bg-bone">
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
          <Link key={b.id} href={`/brands/${b.slug}`} className="brand-tile group relative block aspect-[4/5] overflow-hidden rounded-img bg-brand" data-reveal>
            <CatalogImage src={b.banner_url} alt="" fill sizes="(min-width: 1024px) 20vw, (min-width: 768px) 33vw, 50vw" className="object-cover opacity-70 transition duration-700 ease-out group-hover:scale-105 group-hover:opacity-60" />
            <div className="absolute inset-0 grid place-items-center p-4 text-center">
              <span className="font-serif text-[clamp(1.125rem,5.5vw,1.5rem)] [overflow-wrap:anywhere] text-white md:text-3xl">{b.name}</span>
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
      <div className="grid items-center gap-8 overflow-hidden rounded-card bg-bone md:grid-cols-2 md:gap-0" data-reveal>
        <div className="relative aspect-[4/5] overflow-hidden bg-bone">
          <CatalogImage src={slide.image_url} alt={slide.image_alt || ""} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" data-parallax="0.08" />
        </div>
        <div className="px-6 pb-10 md:px-16 md:py-16">
          {slide.eyebrow && <p className="label-caps text-accent">{slide.eyebrow}</p>}
          <h2 className="mt-4 font-serif text-4xl leading-tight md:text-6xl">{slide.heading}</h2>
          {slide.subheading && <p className="mt-5 max-w-md leading-relaxed text-taupe">{slide.subheading}</p>}
          {safeHref(slide.cta_href) && <Link href={safeHref(slide.cta_href)!} className={buttonClass("secondary", "lg", "mt-8")}>{slide.cta_label || "Discover"}</Link>}
        </div>
      </div>
    </section>
  );
}

/** What the store promises on delivery, returns and payment, from its own settings. */
export function trustPoints(s: Settings) {
  const points: { icon: typeof TruckIcon; title: string; text: string }[] = [
    s.free_shipping_threshold
      ? { icon: TruckIcon, title: `Free delivery over ${formatMoney(s.free_shipping_threshold, s.currency)}`, text: "Tracked to your door, across India" }
      : { icon: TruckIcon, title: "Delivery across India", text: "Tracked to your door" },
  ];
  if (s.return_window_days > 0) {
    points.push({ icon: ReturnIcon, title: `${s.return_window_days}-day returns`, text: s.return_shipping === "free" ? "Free and easy, from your order page" : "Easy, from your order page" });
  }
  if (s.cod_enabled) points.push({ icon: CardIcon, title: "Cash on delivery", text: "Pay when your order arrives" });
  points.push({ icon: ShieldIcon, title: "Secure payments", text: "UPI, cards, net banking and wallets" });
  return points;
}

export function TrustStrip({ settings, variant }: { settings: Settings; variant: DesignKey }) {
  const points = trustPoints(settings);
  switch (variant) {
    case "bazaar":
      return (
        <section className="container-page mt-10 md:mt-14">
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {points.map((p) => (
              <li key={p.title} className="flex items-center gap-3 rounded-card border-2 border-ink bg-paper p-3 md:p-4" data-reveal>
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-on-brand"><p.icon size={18} /></span>
                <span className="min-w-0 text-sm font-bold leading-tight">{p.title}</span>
              </li>
            ))}
          </ul>
        </section>
      );
    case "boutique":
      return (
        <section className="container-page mt-20 md:mt-28">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {points.map((p) => (
              <li key={p.title} className="rounded-card bg-bone p-6 text-center" data-reveal>
                <p.icon size={22} className="mx-auto text-accent" />
                <p className="mt-3 text-sm font-medium">{p.title}</p>
                <p className="mt-1 text-xs text-taupe">{p.text}</p>
              </li>
            ))}
          </ul>
        </section>
      );
    case "heritage":
      return (
        <section className="border-b border-line bg-paper">
          <ul className="container-page flex flex-wrap items-center justify-center gap-x-8 gap-y-3 py-5 text-xs tracking-[0.12em] uppercase">
            {points.map((p, i) => (
              <li key={p.title} className="flex items-center gap-8">
                {i > 0 && <span aria-hidden className="hidden text-[7px] text-accent sm:inline">◆</span>}
                <span className="flex items-center gap-2"><p.icon size={16} className="text-accent" />{p.title}</span>
              </li>
            ))}
          </ul>
        </section>
      );
    default:
      return (
        <section className="container-page mt-20 md:mt-28">
          <ul className="grid gap-6 border-y border-line py-8 sm:grid-cols-2 lg:grid-cols-4">
            {points.map((p) => (
              <li key={p.title} className="flex items-start gap-3" data-reveal>
                <p.icon size={20} className="mt-0.5 shrink-0" />
                <span>
                  <span className="block text-sm font-medium">{p.title}</span>
                  <span className="block text-xs text-taupe">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      );
  }
}

/** The opening of the store's story (Settings › Policies › About), with a link to the rest. */
export function StorySection({ settings, variant }: { settings: Settings; variant: DesignKey }) {
  const about = policiesOf(settings).about?.trim();
  if (!about) return null;
  const opening = excerpt(about.split(/\n{2,}/)[0] ?? about, 360);
  return (
    <section className="mt-20 bg-bone md:mt-28">
      <div className="container-page py-16 text-center md:py-24" data-reveal>
        <p className="label-caps text-accent">Our story</p>
        {variant === "heritage" && <span aria-hidden className="ornament mt-4 text-accent" />}
        <p className="mx-auto mt-6 max-w-3xl font-serif text-2xl leading-relaxed normal-case md:text-3xl">{opening}</p>
        <Link href="/pages/about" className={buttonClass("secondary", "md", "mt-8")}>Read our story</Link>
      </div>
    </section>
  );
}

/** The newsletter sign-up at the foot of the home page, in the design's manner. */
export function NewsletterSection({ variant }: { variant: DesignKey }) {
  const title = "First to know, first to wear";
  const text = "Early access to new collections and the sale, and stories from the people who make them.";
  switch (variant) {
    case "nordic":
      return (
        <section className="container-page mt-20 md:mt-28">
          <div className="grid gap-6 border-t border-line pt-12 md:grid-cols-2 md:items-end">
            <div>
              <h2 className="font-serif text-3xl leading-tight md:text-4xl">{title}</h2>
              <p className="mt-3 max-w-md text-sm text-taupe">{text}</p>
            </div>
            <NewsletterForm source="home" />
          </div>
        </section>
      );
    case "bazaar":
      return (
        <section className="container-page mt-20 md:mt-28">
          <div className="grid gap-8 rounded-card border-2 border-ink bg-brand p-8 text-on-brand shadow-[8px_8px_0_var(--color-ink)] md:grid-cols-2 md:items-center md:p-14">
            <div>
              <h2 className="font-serif text-4xl leading-none md:text-6xl">{title}</h2>
              <p className="mt-4 max-w-md text-sm text-on-brand-soft">{text}</p>
            </div>
            <NewsletterForm source="home" dark boxed />
          </div>
        </section>
      );
    case "boutique":
      return (
        <section className="container-page mt-20 md:mt-28">
          <div className="rounded-card bg-sand px-6 py-14 text-center md:py-20">
            <p className="text-sm text-accent italic">Newsletter</p>
            <h2 className="mx-auto mt-3 max-w-2xl font-serif text-4xl leading-tight md:text-5xl">{title}</h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-taupe">{text}</p>
            <div className="mx-auto max-w-md text-left"><NewsletterForm source="home" boxed /></div>
          </div>
        </section>
      );
    case "heritage":
      return (
        <section className="mt-20 bg-bone md:mt-28">
          <div className="container-page py-16 text-center md:py-20">
            <span aria-hidden className="ornament text-accent" />
            <h2 className="mx-auto mt-5 max-w-2xl font-serif text-3xl leading-tight md:text-5xl">{title}</h2>
            <p className="mx-auto mt-4 max-w-md text-sm text-taupe">{text}</p>
            <div className="mx-auto max-w-md text-left"><NewsletterForm source="home" /></div>
          </div>
        </section>
      );
    case "cinema":
      return (
        <section className="container-page mt-24 md:mt-36">
          <div className="mx-auto max-w-2xl text-center" data-reveal>
            <h2 className="font-serif text-[clamp(2.25rem,5vw,4rem)] leading-[1.05]">{title}</h2>
            <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-taupe">{text}</p>
            <div className="mx-auto max-w-md text-left"><NewsletterForm source="home" boxed /></div>
          </div>
        </section>
      );
    case "neon":
      return (
        <section className="container-page mt-20 md:mt-28">
          <div className="relative overflow-hidden rounded-card border border-line bg-paper p-8 md:p-14" data-reveal>
            <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-brand/30 blur-3xl" />
            <h2 className="relative font-serif text-4xl leading-none md:text-6xl">{title}</h2>
            <p className="relative mt-4 max-w-md text-sm text-taupe">{text}</p>
            <div className="relative max-w-md"><NewsletterForm source="home" boxed /></div>
          </div>
        </section>
      );
    case "noir":
      return (
        <section className="container-page mt-20 md:mt-28">
          <div className="grid gap-8 border-t border-line pt-14 md:grid-cols-[1.3fr_1fr] md:items-end">
            <h2 className="font-serif text-[clamp(2.5rem,6vw,5rem)] leading-[0.95]">Stay close</h2>
            <div>
              <p className="text-sm text-taupe">{text}</p>
              <NewsletterForm source="home" />
            </div>
          </div>
        </section>
      );
    default:
      return (
        <section className="mt-20 bg-sand md:mt-28">
          <div className="container-page grid gap-8 py-16 md:grid-cols-2 md:items-center md:py-20">
            <div>
              <p className="label-caps text-accent">Newsletter</p>
              <h2 className="mt-3 font-serif text-4xl leading-tight md:text-5xl">{title}</h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-taupe">{text}</p>
            </div>
            <NewsletterForm source="home" />
          </div>
        </section>
      );
  }
}

/**
 * Big words with a photograph in front of them: the second banner's heading (or the store's
 * tagline), sliding sideways as the shopper scrolls in cinematic designs.
 */
export function Statement({ heading, image, href, label, glow }: { heading: string; image?: string | null; href: string; label: string; glow?: boolean }) {
  return (
    <section className="relative mt-20 overflow-hidden py-16 md:mt-28 md:py-24">
      <h2 className="sr-only">{heading}</h2>
      <p
        aria-hidden
        data-drift="0.3"
        className={cx(
          "pointer-events-none pl-[4vw] font-serif text-[clamp(4rem,15vw,13rem)] leading-none whitespace-nowrap select-none",
          glow ? "wordmark-glow" : "text-transparent [-webkit-text-stroke:1px_var(--color-taupe)]",
        )}
      >
        {heading} · {heading}
      </p>
      <div className="container-page relative mt-6 grid justify-items-center md:-mt-[9vw]">
        {image && (
          <div className="relative aspect-[3/4] w-[min(76vw,24rem)] overflow-hidden rounded-card bg-bone shadow-2xl" data-reveal>
            <CatalogImage src={image} alt="" fill sizes="(min-width: 768px) 24rem, 76vw" className="object-cover" data-parallax="0.06" />
          </div>
        )}
        <Link href={href} className={buttonClass("primary", "lg", "mt-10")}>{label}</Link>
      </div>
    </section>
  );
}
