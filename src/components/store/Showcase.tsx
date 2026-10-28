"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { ProductCard } from "@/lib/types";
import CatalogImage from "../ui/CatalogImage";
import { buttonClass, cx } from "../ui/controls";
import { ChevronLeft, ChevronRight } from "../ui/icons";
import Price from "./Price";

/**
 * The store's featured pieces one at a time, on a stage: the chosen one in front, lit in its
 * own colour with its name huge behind it, the others lined up either side. The arrows, the
 * dots, a swipe or a click on a neighbour bring the next one forward; a click on the one in
 * front opens it. Stage colours come from theme.ts showcaseColors, so words stay readable.
 */
export default function Showcase({ title, products, colors }: { title: string; products: ProductCard[]; colors: { stage: string; glow: string }[] }) {
  const router = useRouter();
  const n = products.length;
  const [active, setActive] = useState(0);
  const swipe = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const go = (i: number) => setActive(((i % n) + n) % n);
  const p = products[active];
  const { stage, glow } = colors[active];

  return (
    <section
      aria-roledescription="carousel"
      aria-label={title}
      data-showcase
      className="relative mt-20 overflow-hidden py-14 transition-colors duration-700 motion-reduce:transition-none md:mt-28 md:py-20"
      style={{ backgroundColor: stage }}
    >
      <h2 className="label-caps container-page text-center text-accent">
        {title} <span className="text-taupe tabular-nums">· {String(active + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}</span>
      </h2>

      {/* The stage: decorative (the words and buttons below say the same), so hidden from screen readers. */}
      <div
        aria-hidden
        className="relative h-[min(86vw,30rem)] touch-pan-y [--step:31vw] [perspective:1200px] sm:[--step:21vw] lg:h-[36rem] lg:[--step:min(15vw,15rem)]"
        onPointerDown={(e) => (swipe.current = { x: e.clientX, y: e.clientY, moved: false })}
        onPointerUp={(e) => {
          const s = swipe.current;
          if (!s) return;
          const dx = e.clientX - s.x;
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - s.y)) {
            s.moved = true;
            go(active + (dx < 0 ? 1 : -1));
          }
        }}
      >
        {/* Its name, huge, behind it, and light pooling under it in its colour. */}
        <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center select-none">
          <span key={p.id} className="block animate-[reveal_0.9s_cubic-bezier(0.2,0.7,0.2,1)_both] font-serif text-[clamp(4rem,16vw,15rem)] leading-none whitespace-nowrap text-ink/10 motion-reduce:animate-none">
            {p.title}
          </span>
        </p>
        <div
          className="pointer-events-none absolute top-[84%] left-1/2 h-24 w-[min(80vw,34rem)] -translate-x-1/2 rounded-[50%] opacity-60 blur-3xl transition-colors duration-700"
          style={{ backgroundColor: glow }}
        />
        {products.map((q, i) => {
          // Where it stands from the one in front: up to three either side are shown.
          let d = i - active;
          if (d > n / 2) d -= n;
          if (d <= -n / 2) d += n;
          const far = Math.abs(d);
          return (
            <div
              key={q.id}
              onClick={() => {
                if (swipe.current?.moved) return;
                if (d === 0) router.push(`/products/${q.slug}`);
                else go(i);
              }}
              className={cx(
                "absolute top-1/2 left-1/2 w-[50vw] -translate-x-1/2 -translate-y-1/2 transition-[transform,opacity,filter] duration-700 ease-[cubic-bezier(0.2,0.7,0.2,1)] motion-reduce:transition-none sm:w-[32vw] lg:w-[min(21vw,19rem)]",
                far > 3 ? "pointer-events-none" : "cursor-pointer",
              )}
              style={{
                transform: `translateX(calc(${d} * var(--step))) scale(${[1, 0.76, 0.58, 0.46][far] ?? 0.4}) rotateY(${d * -12}deg)`,
                opacity: [1, 0.7, 0.4, 0.2][far] ?? 0,
                filter: d === 0 ? "none" : "saturate(0.6)",
                zIndex: 10 - far,
              }}
            >
              <div className={cx(d === 0 && "animate-float")}>
                <div
                  className="relative aspect-[3/4] overflow-hidden rounded-card bg-bone transition-shadow duration-700"
                  style={{ boxShadow: d === 0 ? `0 40px 110px -30px ${glow}` : "0 20px 50px -30px rgb(0 0 0 / 0.5)" }}
                >
                  <CatalogImage src={q.image_url} alt="" fill sizes="(min-width: 1024px) 19rem, 50vw" className="object-cover" draggable={false} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* What's in front, in words, and the way to the others. */}
      <div className="container-page text-center">
        <div aria-live="polite">
          {p.brand_name && <p className="text-xs tracking-[0.18em] text-taupe uppercase">{p.brand_name}</p>}
          <h3 className="mx-auto mt-2 max-w-2xl font-serif text-3xl leading-[1.05] md:text-5xl">{p.title}</h3>
          <Price price={p.price} compareAt={p.compare_at_price} maxPrice={p.max_price} size="lg" className="mt-3 justify-center" />
        </div>
        <Link href={`/products/${p.slug}`} aria-label={`Shop now: ${p.title}`} className={buttonClass("primary", "lg", "mt-6")}>
          Shop now
        </Link>
        <div className="mt-8 flex items-center justify-center gap-3">
          <button type="button" onClick={() => go(active - 1)} aria-label="Previous piece" className="grid size-11 place-items-center rounded-full border border-line transition-colors hover:bg-ink/5">
            <ChevronLeft size={18} />
          </button>
          <ol className="flex items-center">
            {products.map((q, i) => (
              <li key={q.id}>
                <button type="button" onClick={() => go(i)} aria-label={`Show ${q.title}`} aria-current={i === active} className="grid size-6 place-items-center">
                  <span className={cx("block rounded-full transition-all", i === active ? "size-2.5 bg-ink" : "size-1.5 bg-ink/35")} />
                </button>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => go(active + 1)} aria-label="Next piece" className="grid size-11 place-items-center rounded-full border border-line transition-colors hover:bg-ink/5">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}
