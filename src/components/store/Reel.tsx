"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { ProductCard } from "@/lib/types";
import CatalogImage from "../ui/CatalogImage";
import { buttonClass } from "../ui/controls";
import Price from "./Price";
import { SectionHeader } from "./SectionHeader";

/**
 * The reel: pieces in a row of large frames, each with a giant outlined number. On wide screens
 * the section holds still while the page scrolls and the row slides past sideways, with a bar
 * showing how far along it is; reaching a frame with the keyboard scrolls to it. On phones, and
 * for shoppers who ask for less motion, the row is swiped (or scrolled) sideways instead.
 */
export default function Reel({ products, eyebrow, title }: { products: ProductCard[]; eyebrow: string; title: string }) {
  const section = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  // How far the row slides, in pixels (0 while it isn't pinned).
  const travel = useRef(0);

  useEffect(() => {
    const root = section.current;
    const el = track.current;
    const row = strip.current;
    if (!root || !el || !row) return;
    const wide = window.matchMedia("(min-width: 768px) and (prefers-reduced-motion: no-preference)");
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!travel.current) return;
      const r = el.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      const progress = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
      row.style.transform = `translate3d(${(-progress * travel.current).toFixed(1)}px, 0, 0)`;
      if (bar.current) bar.current.style.transform = `scaleX(${progress.toFixed(4)})`;
    };
    const measure = () => {
      if (!wide.matches) {
        travel.current = 0;
        delete root.dataset.pinned;
        el.style.height = "";
        row.style.transform = "";
        return;
      }
      // Pinned, the row is as wide as its frames (globals.css, "The reel") and slides inside the stage.
      root.dataset.pinned = "";
      travel.current = Math.max(0, row.scrollWidth - el.clientWidth);
      // The row slides one pixel for each pixel scrolled.
      el.style.height = `${travel.current + window.innerHeight}px`;
      update();
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    measure();
    const resized = new ResizeObserver(measure);
    resized.observe(row);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure);
    wide.addEventListener("change", measure);
    return () => {
      resized.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
      wide.removeEventListener("change", measure);
      cancelAnimationFrame(frame);
    };
  }, []);

  // A frame (or the link after the last) reached with the keyboard: scroll the page until the row
  // shows it in the middle.
  const reach = (target: HTMLElement) => {
    const el = track.current;
    if (!el || !travel.current) return;
    const left = target.offsetLeft - (el.clientWidth - target.offsetWidth) / 2;
    const progress = Math.min(1, Math.max(0, left / travel.current));
    const top = el.getBoundingClientRect().top + window.scrollY + progress * (el.offsetHeight - window.innerHeight);
    window.scrollTo({ top, behavior: "instant" });
  };

  if (products.length < 3) return null;
  return (
    <section ref={section} aria-label={title} className="reel mt-20 md:mt-28">
      <div ref={track} className="reel-track relative">
        <div className="reel-stage">
          <div className="container-page">
            <SectionHeader eyebrow={eyebrow} title={title} href="/shop?sort=newest" />
          </div>
          <div
            ref={strip}
            onFocus={(e) => {
              const frame = (e.target as HTMLElement).closest<HTMLElement>("[data-frame]");
              if (frame) reach(frame);
            }}
            className="reel-strip scrollbar-none flex snap-x snap-mandatory gap-6 overflow-x-auto px-4 pb-4 sm:px-6 md:gap-[5vw] md:px-[7vw]"
          >
            {products.map((p, i) => (
              <Link
                key={p.id}
                href={`/products/${p.slug}`}
                data-frame
                className="reel-frame group relative w-[72vw] shrink-0 snap-center pt-[clamp(2.5rem,6vw,5.5rem)] sm:w-[46vw] md:w-[clamp(14rem,calc((100svh-27rem)*0.75),min(30vw,26rem))]"
              >
                <span aria-hidden className="absolute top-0 left-[-0.06em] font-serif text-[clamp(4.5rem,11vw,10rem)] leading-none text-transparent tabular-nums [-webkit-text-stroke:1px_var(--color-taupe)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="relative block aspect-[3/4] overflow-hidden rounded-img bg-bone">
                  <CatalogImage src={p.image_url} alt="" fill sizes="(min-width: 768px) 26rem, 72vw" className="object-cover grayscale-[35%] transition duration-700 group-hover:scale-[1.04] group-hover:grayscale-0" />
                </span>
                <span className="mt-4 flex items-start justify-between gap-4">
                  <span className="min-w-0">
                    {p.brand_name && <span className="block text-[10px] tracking-[0.3em] text-taupe uppercase">{p.brand_name}</span>}
                    <span className="mt-1 block font-serif text-lg leading-tight uppercase md:text-xl">{p.title}</span>
                  </span>
                  <Price price={p.price} compareAt={p.compare_at_price} maxPrice={p.max_price} showPercent={false} className="shrink-0 justify-end" />
                </span>
              </Link>
            ))}
            <div data-frame className="grid w-[60vw] shrink-0 snap-center place-items-center sm:w-[36vw] md:w-[24vw]">
              <div className="text-center">
                <p className="font-serif text-[clamp(1.75rem,3.2vw,3rem)] leading-none uppercase">The full story</p>
                <Link href="/shop" className={buttonClass("primary", "lg", "mt-6")}>Shop all</Link>
              </div>
            </div>
          </div>
          <div aria-hidden className="reel-progress container-page">
            <span className="block h-px bg-line">
              <span ref={bar} className="block h-full origin-left scale-x-0 bg-ink" />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
