"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ProductCard } from "@/lib/types";
import CatalogImage from "../ui/CatalogImage";
import { buttonClass } from "../ui/controls";
import Price from "./Price";
import ProductCardView from "./ProductCard";
import { SectionHeader } from "./SectionHeader";

// The aisle's depth, in the 3D scene's pixels: the first piece's distance, the distance between
// one piece and the next (they alternate sides), and how far the shopper walks.
const FIRST = 520;
const GAP = 340;
const depthOf = (i: number) => FIRST + i * GAP;
const walkOf = (n: number) => depthOf(n - 1) + 260;

/**
 * Products along the two sides of a shop's aisle, walked past as the shopper scrolls: the view
 * stays put while the aisle moves towards them, the next piece is named at the bottom of the
 * screen, and the end of the aisle leads into the shop. Every piece is a link; moving to one
 * with the keyboard walks the aisle up to it. Shoppers who ask for less motion get the same
 * products as a grid.
 */
export default function Aisle({ eyebrow, title, products }: { eyebrow: string; title: string; products: ProductCard[] }) {
  const track = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const fog = useRef<HTMLDivElement>(null);
  const [next, setNext] = useState(0);
  const n = products.length;
  const walk = walkOf(n);

  useEffect(() => {
    const el = track.current;
    const scene = world.current;
    if (!el || !scene || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let shown = -1;
    const update = () => {
      frame = 0;
      const r = el.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      const progress = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
      const cam = progress * walk;
      scene.style.setProperty("--cam", `${cam.toFixed(1)}px`);
      // The fog clears as the end of the aisle comes near.
      if (fog.current) fog.current.style.opacity = String(1 - Math.min(1, Math.max(0, (progress - 0.72) / 0.2)));
      // The next piece to pass: the nearest one still ahead.
      let i = 0;
      while (i < n - 1 && depthOf(i) - cam < -40) i++;
      if (i !== shown) setNext((shown = i));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [n, walk]);

  // A piece reached with the keyboard: walk the aisle up to it.
  const reach = (i: number) => {
    const el = track.current;
    if (!el) return;
    const span = el.offsetHeight - window.innerHeight;
    const progress = Math.min(1, Math.max(0, (depthOf(i) - 420) / walk));
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + progress * span, behavior: "instant" });
  };

  const p = products[next];
  return (
    <section aria-label={title} className="aisle relative mt-20 md:mt-28" style={{ "--walk": `${walk / 2}px`, "--aisle-len": `${depthOf(n - 1) + 2000}px` } as CSSProperties}>
      <div className="container-page">
        <SectionHeader eyebrow={eyebrow} title={title} />
      </div>
      {/* For shoppers who ask for less motion: the same products, still. */}
      <div className="aisle-still container-page grid grid-cols-2 gap-x-3 gap-y-10 md:grid-cols-4 md:gap-x-5">
        {products.map((q) => <ProductCardView key={q.id} product={q} />)}
      </div>
      <div ref={track} className="aisle-walk">
        <div className="sticky top-0 h-[100svh] overflow-hidden bg-bone [perspective:760px] [perspective-origin:50%_42%]">
          <div ref={world} className="absolute top-[46%] left-1/2 [transform-style:preserve-3d]" style={{ transform: "translate3d(0, 0, var(--cam, 0px))" }}>
            <div aria-hidden className="aisle-floor absolute" />
            <div aria-hidden className="aisle-wall absolute" style={{ "--side": -1 } as CSSProperties} />
            <div aria-hidden className="aisle-wall absolute" style={{ "--side": 1 } as CSSProperties} />
            {products.map((q, i) => {
              const side = i % 2 ? 1 : -1;
              return (
                <Link
                  key={q.id}
                  href={`/products/${q.slug}`}
                  onFocus={() => reach(i)}
                  className="aisle-item absolute top-0 left-0 block"
                  style={{ transform: `translate3d(calc(${side} * var(--aisle-x) - 50%), -50%, ${-depthOf(i)}px) rotateY(${side * -58}deg)` }}
                >
                  <span className="relative block aspect-[3/4] overflow-hidden rounded-card bg-paper shadow-[0_30px_60px_-30px_rgb(0_0_0/0.6)]">
                    <CatalogImage src={q.image_url} alt="" fill sizes="(min-width: 768px) 16rem, 36vw" className="object-cover" draggable={false} />
                  </span>
                  <span className="mt-3 block text-center text-sm leading-snug">{q.title}</span>
                </Link>
              );
            })}
            <div className="aisle-end absolute top-0 left-0 w-max text-center" style={{ transform: `translate3d(-50%, -50%, ${-(depthOf(n - 1) + 600)}px)` }}>
              <p className="font-serif text-[clamp(2rem,5vw,4rem)] leading-none">Everything else is inside</p>
              <Link href="/shop" className={buttonClass("primary", "lg", "mt-6")}>Shop all</Link>
            </div>
          </div>
          {/* Fog at the far end, so the aisle fades away rather than ending. */}
          <div ref={fog} aria-hidden className="aisle-fog pointer-events-none absolute inset-0" />
          {p && (
            <div className="absolute inset-x-0 bottom-5 flex justify-center px-4">
              <Link
                href={`/products/${p.slug}`}
                className="flex max-w-full items-center gap-4 rounded-btn border border-line bg-paper/90 px-5 py-3 shadow-lg backdrop-blur"
              >
                <span className="text-xs text-taupe tabular-nums">{String(next + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}</span>
                <span className="min-w-0 truncate text-sm font-medium">{p.title}</span>
                <Price price={p.price} compareAt={p.compare_at_price} maxPrice={p.max_price} className="shrink-0 text-sm" />
              </Link>
            </div>
          )}
        </div>
        {/* The walk's length: the scroll that carries the shopper down the aisle. */}
        <div aria-hidden className="h-[var(--walk)]" />
      </div>
    </section>
  );
}
