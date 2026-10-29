import { Fragment, type ReactNode } from "react";
import Aisle from "@/components/store/Aisle";
import NewsletterForm from "@/components/store/NewsletterForm";
import Numbers, { type Figure } from "@/components/store/Numbers";
import Rack from "@/components/store/Rack";
import RecentlyViewed from "@/components/store/RecentlyViewed";
import Showcase from "@/components/store/Showcase";
import Hero from "@/components/store/heroes";
import Spotlight, { type Chapter } from "@/components/store/Spotlight";
import {
  BrandStrip,
  CampaignBand,
  CollectionCards,
  Departments,
  NewsletterSection,
  ProductGrid,
  ProductRail,
  PromiseBand,
  PromoGrid,
  SectionHeader,
  SeasonalFeature,
  Statement,
  StorySection,
  TrustStrip,
  trustPoints,
} from "@/components/store/sections";
import { getHomeData } from "@/lib/catalog";
import { homeSections, type SectionKey } from "@/lib/designs";
import { storefrontLook } from "@/lib/look";
import { formatMoney } from "@/lib/money";
import { getSettings, homepageOf, socialOf } from "@/lib/settings";
import { storeKind } from "@/lib/store-types";
import { excerpt, jsonLd } from "@/lib/seo";
import { safeHref } from "@/lib/urls";
import { chapterColors, showcaseColors } from "@/lib/theme";
import { contextOrigin } from "@/lib/store";

export default async function Home() {
  const [settings, data, origin] = await Promise.all([getSettings(), getHomeData(), contextOrigin()]);
  const { design, look } = await storefrontLook(settings);
  const kind = storeKind(settings.store_type);
  const home = homepageOf(settings);
  const [hero, campaign] = home.hero ?? [];

  const structured = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: settings.store_name,
      url: origin,
      logo: settings.logo_url || undefined,
      sameAs: Object.values(socialOf(settings)).filter(Boolean),
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: settings.store_name,
      url: origin,
      potentialAction: {
        "@type": "SearchAction",
        target: `${origin}/shop?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  ];

  // A store with nothing on sale yet (new, or every product still a draft) says so, and
  // collects emails for the day it opens, instead of offering empty shelves.
  if (!data.newArrivals.length) {
    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} />
        <section className="container-page py-24 text-center md:py-36">
          <p className="label-caps text-accent">Opening soon</p>
          <h1 className="mx-auto mt-6 max-w-4xl font-serif text-5xl leading-[1.05] md:text-7xl">{settings.store_name}</h1>
          {settings.tagline && <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-taupe">{settings.tagline}</p>}
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-taupe">
            We&apos;re getting our first collection ready. Leave your email and we&apos;ll tell you the day we open.
          </p>
          <div className="mx-auto mt-6 max-w-md text-left">
            <NewsletterForm source="opening-soon" boxed={design.buttons === "pill"} />
          </div>
        </section>
      </>
    );
  }

  // Spotlight chapters: the featured collections, or else the departments.
  const chapters: Chapter[] = (
    data.trending.length >= 2
      ? data.trending.map((c) => ({ title: c.title, text: c.description ? excerpt(c.description, 180) : null, image: c.image_url || c.banner_url, href: `/collections/${c.slug}`, eyebrow: c.season || "Collection" }))
      : data.departments.map((d) => ({ title: d.name, text: d.description ? excerpt(d.description, 180) : null, image: d.image_url, href: `/category/${d.slug}`, eyebrow: "Department" }))
  ).slice(0, 4);
  const statementImage = campaign?.image_url || home.promos?.[0]?.image_url || data.departments[0]?.image_url || null;
  // Products with a picture, each once, in the order given.
  const pictured = (...lists: (typeof data.featured)[]) => lists.flat().filter((p, i, all) => p.image_url && all.findIndex((q) => q.id === p.id) === i);
  // The Showcase: the store's featured pieces, then best sellers and new arrivals; each is lit in
  // its first colour. The rail starts from what's new, the aisle from what sells.
  const showcase = pictured(data.featured, data.bestSellers, data.newArrivals).slice(0, 8);
  const rack = pictured(data.newArrivals, data.featured).slice(0, 10);
  const aisle = pictured(data.bestSellers, data.newArrivals, data.featured).slice(0, 12);
  // Numbers: the store's own, or what its catalog and promises say.
  const figures: Figure[] = home.stats?.length
    ? home.stats
    : [
        data.productCount > 0 && { value: data.productCount.toLocaleString("en-IN"), label: `${kind.many} to choose from` },
        data.brandCount > 1 && { value: String(data.brandCount), label: "brands" },
        settings.return_window_days > 0 && { value: String(settings.return_window_days), label: "days to change your mind" },
        !!settings.free_shipping_threshold && { value: formatMoney(settings.free_shipping_threshold, settings.currency), label: "and over, delivered free" },
      ].filter((f): f is Figure => !!f);

  // Every section the home page can show; the design (or the store's own arrangement in
  // Settings › Homepage) decides which appear, and in what order.
  const order = homeSections(design, home.sections);
  const sections: Record<SectionKey, () => ReactNode> = {
    hero: () => (
      <Hero
        variant={design.hero}
        slide={hero}
        storeName={settings.store_name}
        tagline={settings.tagline}
        extras={[...(home.promos ?? []).map((p) => p.image_url), ...data.departments.map((d) => d.image_url)]}
        text={kind.words.heroText}
      />
    ),
    trust: () => <TrustStrip settings={settings} variant={design.key} />,
    departments: () => <Departments departments={data.departments} variant={design.departments} browse={kind.words.browse} early={order.indexOf("departments") === 1} />,
    new: () =>
      design.key === "nordic" ? (
        <section className="container-page mt-20 md:mt-28">
          <SectionHeader eyebrow="Just landed" title="New arrivals" href="/shop?sort=newest" />
          <ProductGrid products={data.newArrivals.slice(0, 8)} />
        </section>
      ) : (
        <ProductRail eyebrow="Just landed" title="New arrivals" href="/shop?sort=newest" products={data.newArrivals} />
      ),
    promos: () => <PromoGrid promos={home.promos} />,
    best: () =>
      data.bestSellers.length > 0 && (
        <section className="container-page mt-20 md:mt-28">
          <SectionHeader
            eyebrow={data.bestSellersAreFeatured ? "Our edit" : "Most loved"}
            title={data.bestSellersAreFeatured ? kind.words.favourites : "Best sellers"}
            href={data.bestSellersAreFeatured ? "/shop" : "/shop?sort=popular"}
          />
          <ProductGrid products={data.bestSellers} />
        </section>
      ),
    seasonal: () => <SeasonalFeature collection={data.seasonal[0]} />,
    collections: () => <CollectionCards collections={data.trending} />,
    brands: () => <BrandStrip brands={data.brands} />,
    campaign: () => campaign && <CampaignBand slide={campaign} />,
    spotlight: () => chapters.length >= 2 && <Spotlight chapters={chapters} colors={chapterColors(look.colors, chapters.length)} />,
    showcase: () =>
      showcase.length >= 3 && (
        <Showcase
          title={kind.words.favourites}
          products={showcase}
          colors={showcaseColors(look.colors, showcase.map((p) => p.swatches?.[0]?.hex))}
        />
      ),
    rack: () =>
      rack.length >= 3 && (
        <Rack eyebrow={kind.display === "hangers" ? "On the rail" : "On the shelf"} title="Take your pick" products={rack} display={kind.display} />
      ),
    aisle: () => aisle.length >= 4 && <Aisle eyebrow="Scroll to look around" title="Walk the aisle" products={aisle} />,
    marquee: () => <PromiseBand words={[...trustPoints(settings).map((p) => p.title), settings.tagline].filter(Boolean)} />,
    // Figures the owner set show however few they are; figures worked out from the store need two.
    numbers: () => figures.length >= (home.stats?.length ? 1 : 2) && <Numbers title="By the numbers" figures={figures} />,
    statement: () => (
      <Statement
        heading={campaign?.heading || settings.tagline || settings.store_name}
        image={statementImage}
        href={safeHref(campaign?.cta_href) ?? "/shop"}
        label={campaign?.cta_label || "Shop now"}
        glow={design.title === "glow"}
      />
    ),
    story: () => <StorySection settings={settings} variant={design.key} />,
    recommended: () => <RecentlyViewed title="Recommended for you" mode="recommend" />,
    newsletter: () => <NewsletterSection variant={design.key} title={kind.words.newsletter} text={kind.words.newsletterText} />,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} />
      {order.map((key) => (
        <Fragment key={key}>{sections[key]()}</Fragment>
      ))}
    </>
  );
}
