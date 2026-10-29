"use client";
import Link from "next/link";
import { useState } from "react";
import type { ProductCard } from "@/lib/types";
import CatalogImage from "../ui/CatalogImage";
import { cx } from "../ui/controls";
import { ArrowRight } from "../ui/icons";
import Price from "./Price";
import { SectionHeader } from "./SectionHeader";

/**
 * The index: products as a numbered list in large type, one to a line, like the contents page
 * of a catalogue. On wide screens the piece pointed at (or reached with the keyboard) shows in
 * a picture beside the list, and the other lines step back into the softer text colour (still
 * readable); on phones each line has its own small picture. Pictures beside the list load once
 * the shopper points at the list.
 */
export default function IndexList({ products, eyebrow, title = "The index" }: { products: ProductCard[]; eyebrow: string; title?: string }) {
  const [active, setActive] = useState(0);
  const [warm, setWarm] = useState(false);
  if (products.length < 3) return null;
  const shown = products[active] ?? products[0];

  return (
    <section aria-label={title} className="container-page mt-20 md:mt-32">
      <SectionHeader eyebrow={eyebrow} title={title} href="/shop?sort=newest" linkLabel="Shop all" />
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_25rem]">
        <ol className="index-list group/list border-t border-line" onPointerEnter={() => setWarm(true)} onFocus={() => setWarm(true)}>
          {products.map((p, i) => (
            <li key={p.id} className="border-b border-line" data-reveal>
              <Link
                href={`/products/${p.slug}`}
                onPointerEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                className={cx(
                  "group grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-x-4 py-3 transition-[color,padding] duration-500 ease-out sm:grid-cols-[4rem_minmax(0,1fr)_auto] md:py-5 lg:grid-cols-[3rem_minmax(0,1fr)_10rem_7.5rem_1.25rem] lg:group-hover/list:text-taupe lg:hover:pl-3 lg:hover:text-ink! lg:focus-visible:text-ink!",
                  i === active && "lg:pl-3",
                )}
              >
                <span className="relative block aspect-[3/4] overflow-hidden rounded-img bg-bone lg:hidden">
                  <CatalogImage src={p.image_url} alt="" fill sizes="64px" className="object-cover" />
                </span>
                <span className="hidden text-xs text-taupe tabular-nums lg:block">{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0">
                  <span className="block truncate font-serif text-lg leading-tight sm:text-2xl lg:text-[clamp(1.5rem,2.6vw,2.5rem)]">{p.title}</span>
                  {p.brand_name && <span className="mt-1 block truncate text-xs text-taupe lg:hidden">{p.brand_name}</span>}
                </span>
                <span className="hidden truncate text-sm text-taupe lg:block">{p.brand_name}</span>
                <Price price={p.price} compareAt={p.compare_at_price} maxPrice={p.max_price} showPercent={false} className="justify-end text-right" />
                <ArrowRight size={18} className="hidden transition-transform duration-500 group-hover:translate-x-1 lg:block" />
              </Link>
            </li>
          ))}
        </ol>
        {/* The piece pointed at, beside the list (the list itself says everything this shows). */}
        <div aria-hidden className="hidden lg:block">
          <div className="sticky top-24">
            <div className="relative aspect-[3/4] overflow-hidden rounded-img bg-bone">
              {products.map((p, i) =>
                i === 0 || warm ? (
                  <CatalogImage
                    key={p.id}
                    src={p.image_url}
                    alt=""
                    fill
                    sizes="(min-width: 1280px) 25rem, 20rem"
                    className={cx("object-cover transition-[opacity,scale] duration-700 ease-out", i === active ? "scale-100 opacity-100" : "scale-[1.04] opacity-0")}
                  />
                ) : null,
              )}
            </div>
            <p data-preview className="mt-3 flex items-baseline justify-between gap-4 text-xs text-taupe">
              <span className="truncate">{shown.title}</span>
              <span className="tabular-nums">{String(active + 1).padStart(2, "0")} / {String(products.length).padStart(2, "0")}</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
