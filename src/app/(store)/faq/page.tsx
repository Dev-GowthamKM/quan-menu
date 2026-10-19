import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/store/listing/ProductListing";
import Paragraphs from "@/components/store/Paragraphs";
import { ChevronDown } from "@/components/ui/icons";
import { jsonLd } from "@/lib/seo";
import { faqOf, getSettings } from "@/lib/settings";

export const revalidate = 300;
export const metadata: Metadata = { title: "FAQs", description: "Answers about orders, delivery, payment, sizing and returns.", alternates: { canonical: "/faq" } };

export default async function FaqPage() {
  const faq = faqOf(await getSettings());
  const structured = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <div className="container-page pt-8 md:pt-12">
      {faq.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} />}
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "FAQs" }]} />
      <div className="mx-auto mt-10 max-w-2xl">
        <h1 className="font-serif text-5xl">Frequently asked questions</h1>
        <div className="mt-10 border-t border-line">
          {faq.map((f) => (
            <details key={f.q} className="group border-b border-line">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 font-serif text-xl [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown size={18} className="shrink-0 transition group-open:rotate-180" />
              </summary>
              <div className="pb-6 leading-relaxed text-taupe"><Paragraphs text={f.a} /></div>
            </details>
          ))}
        </div>
        <p className="mt-10 text-sm text-taupe">
          Still need help? <Link href="/contact" className="underline underline-offset-4">Send us a message</Link>.
        </p>
      </div>
    </div>
  );
}
