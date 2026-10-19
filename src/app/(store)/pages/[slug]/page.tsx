import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/store/listing/ProductListing";
import Paragraphs from "@/components/store/Paragraphs";
import { formatDate } from "@/lib/format";
import { excerpt } from "@/lib/seo";
import { getSettings, policiesOf } from "@/lib/settings";
import type { Policies } from "@/lib/types";

export const revalidate = 300;

const PAGES: Record<string, { key: keyof Policies; title: string }> = {
  about: { key: "about", title: "Our story" },
  shipping: { key: "shipping", title: "Shipping & delivery" },
  returns: { key: "returns", title: "Returns & refunds" },
  privacy: { key: "privacy", title: "Privacy policy" },
  terms: { key: "terms", title: "Terms of service" },
};

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return Object.keys(PAGES).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = PAGES[slug];
  if (!page) return {};
  const text = policiesOf(await getSettings())[page.key];
  return { title: page.title, description: excerpt(text), alternates: { canonical: `/pages/${slug}` } };
}

export default async function PolicyPage({ params }: Props) {
  const { slug } = await params;
  const page = PAGES[slug];
  if (!page) notFound();
  const settings = await getSettings();
  const text = policiesOf(settings)[page.key];
  return (
    <div className="container-page pt-8 md:pt-12">
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: page.title }]} />
      <div className="mx-auto mt-10 max-w-2xl">
        <h1 className="font-serif text-5xl">{page.title}</h1>
        <p className="mt-3 text-xs text-stone">Last updated {formatDate(settings.updated_at)}</p>
        <div className="mt-10 leading-relaxed text-taupe">
          {text ? <Paragraphs text={text} /> : <p>This page hasn&apos;t been written yet.</p>}
        </div>
        <p className="mt-12 border-t border-line pt-6 text-sm text-taupe">
          Questions? <Link href="/contact" className="underline underline-offset-4">Contact us</Link>.
        </p>
      </div>
    </div>
  );
}
