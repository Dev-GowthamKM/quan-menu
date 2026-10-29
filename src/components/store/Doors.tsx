import Link from "next/link";
import CatalogImage from "../ui/CatalogImage";
import { SectionHeader } from "./SectionHeader";

export interface Doorway {
  href: string;
  title: string;
  image: string | null;
  note: string;
}

/**
 * Doorways: the store's collections (or departments) behind arched, carved doors that swing
 * open as the shopper reaches them, then stand open with the collection inside (globals.css,
 * "Doorways"). Without motion, or before the page's script runs, the doors simply stand open.
 */
export default function Doors({ doorways, eyebrow, title }: { doorways: Doorway[]; eyebrow: string; title: string }) {
  const shown = doorways.filter((d) => d.image).slice(0, 4);
  if (shown.length < 2) return null;
  return (
    <section aria-label={title} className="doors relative mt-20 overflow-hidden bg-bone py-16 md:mt-28 md:py-24">
      <div aria-hidden className="jaali pointer-events-none absolute inset-0 text-accent opacity-[0.07]" />
      <div className="container-page relative">
        <SectionHeader eyebrow={eyebrow} title={title} />
        <ul className={`grid grid-cols-2 gap-x-5 gap-y-12 md:gap-x-8 ${shown.length === 3 ? "md:grid-cols-3" : "md:grid-cols-4"}`}>
          {shown.map((d) => (
            <li key={d.href} className="doorway" data-reveal>
              <Link href={d.href} className="group block text-center">
                <span className="block aspect-[3/4] rounded-t-full border border-accent p-1.5 transition-colors duration-500 group-hover:border-ink">
                  <span className="relative block size-full overflow-hidden rounded-t-full bg-sand [perspective:900px]">
                    <CatalogImage src={d.image} alt="" fill sizes="(min-width: 768px) 25vw, 50vw" className="doorway-view object-cover" />
                    <span aria-hidden className="door door-left" />
                    <span aria-hidden className="door door-right" />
                  </span>
                </span>
                <span className="mt-5 block text-[11px] tracking-[0.22em] text-accent uppercase">{d.note}</span>
                <span className="mt-2 block font-serif text-lg leading-snug tracking-[0.08em] uppercase md:text-xl">{d.title}</span>
                <span aria-hidden className="ornament mt-3 text-accent" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
