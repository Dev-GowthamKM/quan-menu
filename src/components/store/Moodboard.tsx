import Link from "next/link";
import type { CSSProperties } from "react";
import type { Collection } from "@/lib/catalog";
import type { ProductCard } from "@/lib/types";
import CatalogImage from "../ui/CatalogImage";
import { cx } from "../ui/controls";
import { SectionHeader } from "./SectionHeader";

interface Pin {
  href: string;
  image: string;
  caption: string;
  note: string;
}

// Each pinned picture's own tilt, shape and sway, so the board looks put together by hand.
const PINS = [
  { tilt: -4, ratio: "aspect-[4/5]", sway: 7.5 },
  { tilt: 3, ratio: "aspect-square", sway: 6.5 },
  { tilt: -2, ratio: "aspect-[3/4]", sway: 8 },
  { tilt: 4, ratio: "aspect-[4/5]", sway: 7 },
  { tilt: -3, ratio: "aspect-[3/4]", sway: 6 },
  { tilt: 2, ratio: "aspect-square", sway: 8.5 },
];

/**
 * The moodboard: the store's collections and pieces as photographs pinned to a board, each
 * tilted a little under a strip of tape, with a handwritten-style note, drifting gently (still
 * for shoppers who ask for less motion). Collections and pieces take turns.
 */
export default function Moodboard({ collections, products, title }: { collections: Collection[]; products: ProductCard[]; title: string }) {
  const fromCollections: Pin[] = collections
    .filter((c) => c.image_url || c.banner_url)
    .map((c) => ({ href: `/collections/${c.slug}`, image: (c.image_url || c.banner_url)!, caption: c.title, note: c.season || "Collection" }));
  const fromProducts: Pin[] = products
    .filter((p) => p.image_url)
    .map((p) => ({ href: `/products/${p.slug}`, image: p.image_url!, caption: p.title, note: p.brand_name || "New in" }));
  const pins: Pin[] = [];
  for (let i = 0; pins.length < PINS.length && (i < fromCollections.length || i < fromProducts.length); i++) {
    if (fromCollections[i]) pins.push(fromCollections[i]);
    if (fromProducts[i] && pins.length < PINS.length) pins.push(fromProducts[i]);
  }
  if (pins.length < 4) return null;

  return (
    <section aria-label={title} className="moodboard relative mt-20 overflow-hidden py-6 md:mt-28">
      <div aria-hidden className="pointer-events-none absolute top-10 -left-24 size-80 rounded-full bg-brand/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-20 bottom-0 size-96 rounded-full bg-accent/15 blur-3xl" />
      <div className="container-page relative">
        <SectionHeader eyebrow="This season we love" title={title} />
        <ul className="columns-2 gap-4 sm:gap-8 md:columns-3 md:gap-12">
          {pins.map((pin, i) => (
            // The top padding keeps each pin's tape inside its own column.
            <li key={pin.href} className="mb-4 break-inside-avoid pt-4 md:mb-10" data-reveal>
              <Link
                href={pin.href}
                className="mood-pin group relative block rounded-card bg-paper p-2.5 pb-4 shadow-[0_18px_40px_-22px_rgb(0_0_0/0.45)] transition-[rotate,translate,box-shadow] duration-500 hover:z-10 hover:shadow-[0_26px_50px_-20px_rgb(0_0_0/0.5)] md:p-3.5 md:pb-5"
                style={{ "--tilt": `${PINS[i].tilt}deg`, "--sway": `${PINS[i].sway}s` } as CSSProperties}
              >
                <span aria-hidden className="mood-tape absolute -top-3 left-1/2 h-6 w-20 -translate-x-1/2 bg-accent/35 md:w-24" />
                <span className={cx("relative block overflow-hidden rounded-img bg-bone", PINS[i].ratio)}>
                  <CatalogImage src={pin.image} alt="" fill sizes="(min-width: 768px) 28vw, 46vw" className="object-cover transition duration-700 group-hover:scale-105" />
                </span>
                <span className="mt-3 block px-1 text-center">
                  <span className="block text-[11px] text-accent italic">{pin.note}</span>
                  <span className="mt-0.5 block font-serif text-base leading-snug md:text-xl">{pin.caption}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
