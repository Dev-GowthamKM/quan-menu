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
import { SITE_URL } from "@/lib/env";
import { getSettings, homepageOf, socialOf } from "@/lib/settings";
import { jsonLd } from "@/lib/seo";

export const revalidate = 300;

export default async function Home() {
  const [settings, data] = await Promise.all([getSettings(), getHomeData()]);
  const home = homepageOf(settings);
  const [hero, campaign] = home.hero ?? [];

  const structured = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: settings.store_name,
      url: SITE_URL,
      logo: settings.logo_url || undefined,
      sameAs: Object.values(socialOf(settings)).filter(Boolean),
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: settings.store_name,
      url: SITE_URL,
      potentialAction: {
        "@type": "SearchAction",
        target: `${SITE_URL}/shop?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  ];

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
