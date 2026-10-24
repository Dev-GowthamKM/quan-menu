import NewsletterForm from "@/components/store/NewsletterForm";
import RecentlyViewed from "@/components/store/RecentlyViewed";
import {
  BrandStrip,
  CampaignBand,
  CollectionCards,
  DepartmentTiles,
  Hero,
  ProductGrid,
  ProductRail,
  PromoGrid,
  SectionHeader,
  SeasonalFeature,
} from "@/components/store/sections";
import { getHomeData } from "@/lib/catalog";
import { getSettings, homepageOf, socialOf } from "@/lib/settings";
import { jsonLd } from "@/lib/seo";
import { contextOrigin } from "@/lib/store";

export default async function Home() {
  const [settings, data, origin] = await Promise.all([getSettings(), getHomeData(), contextOrigin()]);
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
            <NewsletterForm source="opening-soon" />
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} />
      <Hero slide={hero} storeName={settings.store_name} tagline={settings.tagline} />
      <DepartmentTiles departments={data.departments} />
      <ProductRail eyebrow="Just landed" title="New arrivals" href="/shop?sort=newest" products={data.newArrivals} />
      <PromoGrid promos={home.promos} />
      {data.bestSellers.length > 0 && (
        <section className="container-page mt-20 md:mt-28">
          <SectionHeader
            eyebrow={data.bestSellersAreFeatured ? "Our edit" : "Most loved"}
            title={data.bestSellersAreFeatured ? "Pieces we love" : "Best sellers"}
            href={data.bestSellersAreFeatured ? "/shop" : "/shop?sort=popular"}
          />
          <ProductGrid products={data.bestSellers} />
        </section>
      )}
      <SeasonalFeature collection={data.seasonal[0]} />
      <CollectionCards collections={data.trending} />
      <BrandStrip brands={data.brands} />
      {campaign && <CampaignBand slide={campaign} />}
      <RecentlyViewed title="Recommended for you" mode="recommend" />
      <section className="mt-20 bg-sand md:mt-28">
        <div className="container-page grid gap-8 py-16 md:grid-cols-2 md:items-center md:py-20">
          <div>
            <p className="label-caps text-accent">Newsletter</p>
            <h2 className="mt-3 font-serif text-4xl leading-tight md:text-5xl">First to know, first to wear</h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-taupe">Early access to new collections and the sale, and stories from the people who make them.</p>
          </div>
          <NewsletterForm source="home" />
        </div>
      </section>
    </>
  );
}
