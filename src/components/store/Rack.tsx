"use client";
import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import type { ProductCard } from "@/lib/types";
import CatalogImage from "../ui/CatalogImage";
import { buttonClass, cx } from "../ui/controls";
import { ChevronLeft, ChevronRight, CloseIcon } from "../ui/icons";
import Price from "./Price";
import { SectionHeader } from "./SectionHeader";

/** A clothes hanger: a hook to go over the rail, and the shoulders a piece hangs from. */
function Hanger({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 52" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M60 25v-6.5c0-3.2 6.5-4.6 6.5-10.6a6.5 6.5 0 0 0-12.7-2" />
      <path d="M60 25 10.5 44.2c-3.6 1.4-2.7 5.6 1.1 5.6h96.8c3.8 0 4.7-4.2 1.1-5.6Z" />
    </svg>
  );
}

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The store's pieces on a clothes rail, each on its hanger (or, for goods that don't hang,
 * standing on a shelf). A hanger swings when the pointer touches it; a tap brings that piece
 * forward, large, with the rest of the page blurred behind it, where it can be turned to see
 * its back (its second photo) and the others reached without going back to the rail.
 */
export default function Rack({ eyebrow, title, products, display }: { eyebrow: string; title: string; products: ProductCard[]; display: "hangers" | "shelf" }) {
  const [open, setOpen] = useState<number | null>(null);
  const [back, setBack] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  // Where the piece was on the rail when it was chosen, for it to come forward from there.
  const from = useRef<DOMRect | null>(null);
  const hangers = display === "hangers";
  const n = products.length;

  const choose = (i: number) => {
    from.current = items.current[i]?.querySelector("[data-card]")?.getBoundingClientRect() ?? null;
    setBack(false);
    setOpen(i);
  };
  const step = (d: number) => {
    from.current = null;
    setBack(false);
    setOpen((i) => (i === null ? i : (i + d + n) % n));
  };

  // Opens the close look, and the chosen piece travels to it from its place on the rail.
  useLayoutEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open === null) {
      if (d.open) d.close();
      return;
    }
    if (!d.open) {
      d.showModal();
      document.documentElement.style.overflow = "hidden";
    }
    const el = stage.current;
    const start = from.current;
    if (!el || !start || reduced()) return;
    const end = el.getBoundingClientRect();
    if (!end.width) return;
    el.animate(
      [
        { transformOrigin: "0 0", transform: `translate(${start.left - end.left}px, ${start.top - end.top}px) scale(${start.width / end.width})` },
        { transformOrigin: "0 0", transform: "none" },
      ],
      { duration: 650, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" },
    );
    from.current = null;
  }, [open]);

  const p = open === null ? null : products[open];
  const sides = p?.hover_image_url ? [p.image_url, p.hover_image_url] : null;

  return (
    <section aria-label={title} className="mt-20 md:mt-28">
      <div className="container-page">
        <SectionHeader eyebrow={eyebrow} title={title} />
        <p className="-mt-4 mb-6 text-sm text-taupe">{hangers ? "Tap a piece to take a closer look." : "Tap one to take a closer look."}</p>
      </div>
      <div className="relative">
        {/* The rail the hangers hang from, or the shelf the pieces stand on. */}
        <div
          aria-hidden
          className={cx("pointer-events-none absolute inset-x-0 z-0", hangers ? "rack-bar top-[3px] h-1.5" : "rack-shelf bottom-[0.625rem] h-3.5")}
        />
        <ul
          className={cx(
            "scrollbar-none relative z-[1] flex snap-x gap-2 overflow-x-auto px-[max(1rem,calc((100vw-88rem)/2+2.5rem))] md:gap-3",
            hangers ? "pt-0 pb-10" : "pt-8 pb-6 md:gap-6",
          )}
        >
          {products.map((q, i) => (
            <li key={q.id} className="shrink-0 snap-center" data-reveal>
              <button
                ref={(el) => {
                  items.current[i] = el;
                }}
                type="button"
                onClick={() => choose(i)}
                aria-label={`${q.title}: take a closer look`}
                className={cx("group block w-[min(42vw,11.5rem)] text-left md:w-48", hangers ? "rack-hang" : "rack-stand")}
              >
                {hangers && <Hanger className="relative z-[2] mx-auto -mb-[3px] block w-[86%] text-stone" />}
                <span
                  data-card
                  className={cx(
                    "relative block aspect-[3/4] overflow-hidden bg-bone transition-shadow duration-500",
                    hangers ? "rounded-[0.4rem] shadow-[0_18px_30px_-18px_rgb(0_0_0/0.55)]" : "rounded-card shadow-[0_22px_26px_-20px_rgb(0_0_0/0.6)] group-hover:shadow-[0_34px_40px_-24px_rgb(0_0_0/0.6)]",
                  )}
                >
                  <CatalogImage src={q.image_url} alt="" fill sizes="(min-width: 768px) 12rem, 42vw" className="object-cover" draggable={false} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <dialog
        ref={dialog}
        aria-label={p?.title}
        onClose={() => {
          document.documentElement.style.overflow = "";
          const i = open;
          setOpen(null);
          if (i !== null) items.current[i]?.focus();
        }}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-0 text-ink backdrop:bg-ivory/55 backdrop:backdrop-blur-xl open:grid open:place-items-center"
      >
        {p && (
          <div className="grid w-full max-w-5xl items-center gap-6 overflow-y-auto px-6 py-16 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] md:gap-14">
            <div ref={stage} className="mx-auto w-[min(68vw,22rem)] md:w-[min(34vw,24rem)]">
              {hangers && <Hanger className="relative z-[2] mx-auto -mb-[4px] block w-[86%] text-stone" />}
              <div className="aspect-[3/4] [perspective:1600px]">
                <div
                  className={cx(
                    "relative size-full transition-transform duration-700 ease-[cubic-bezier(0.2,0.7,0.2,1)] [transform-style:preserve-3d] motion-reduce:transition-none",
                    back && "[transform:rotateY(180deg)]",
                  )}
                >
                  <div className="absolute inset-0 overflow-hidden rounded-card bg-bone shadow-[0_40px_90px_-40px_rgb(0_0_0/0.7)] [backface-visibility:hidden]">
                    <CatalogImage src={p.image_url} alt={p.image_alt || p.title} fill sizes="(min-width: 768px) 24rem, 68vw" className="object-cover" />
                  </div>
                  {sides && (
                    <div className="absolute inset-0 overflow-hidden rounded-card bg-bone shadow-[0_40px_90px_-40px_rgb(0_0_0/0.7)] [backface-visibility:hidden] [transform:rotateY(180deg)]">
                      <CatalogImage src={sides[1]} alt={`${p.title}, the back`} fill sizes="(min-width: 768px) 24rem, 68vw" className="object-cover" />
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="text-center md:text-left">
              {p.brand_name && <p className="text-xs tracking-[0.18em] text-taupe uppercase">{p.brand_name}</p>}
              <h2 className="mt-2 font-serif text-3xl leading-[1.05] md:text-4xl">{p.title}</h2>
              <Price price={p.price} compareAt={p.compare_at_price} maxPrice={p.max_price} size="lg" className="mt-3 justify-center md:justify-start" />
              {sides && (
                <div role="group" aria-label="Side" className="mt-6 inline-flex rounded-btn border border-line p-1">
                  {["Front", "Back"].map((label, k) => (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={back === (k === 1)}
                      onClick={() => setBack(k === 1)}
                      className={cx("h-9 rounded-btn px-5 text-[12px] tracking-[0.14em] uppercase transition-colors", back === (k === 1) ? "bg-ink text-ivory" : "text-taupe hover:text-ink")}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3 md:justify-start">
                <Link href={`/products/${p.slug}`} className={buttonClass("primary", "lg")}>
                  Shop now
                </Link>
              </div>
              {n > 1 && (
                <div className="mt-8 flex items-center justify-center gap-3 md:justify-start">
                  <button type="button" onClick={() => step(-1)} aria-label="Previous piece" className="grid size-11 place-items-center rounded-full border border-line transition-colors hover:bg-ink/5">
                    <ChevronLeft size={18} />
                  </button>
                  <span className="text-xs text-taupe tabular-nums">{String((open ?? 0) + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}</span>
                  <button type="button" onClick={() => step(1)} aria-label="Next piece" className="grid size-11 place-items-center rounded-full border border-line transition-colors hover:bg-ink/5">
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          aria-label={hangers ? "Back to the rail" : "Back to the shelf"}
          className="fixed top-4 right-4 grid size-11 place-items-center rounded-full border border-line bg-paper/80 backdrop-blur transition-colors hover:bg-paper"
        >
          <CloseIcon />
        </button>
      </dialog>
    </section>
  );
}
