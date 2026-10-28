"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { countTo } from "@/lib/numbers";

export interface Figure {
  value: string;
  label: string;
}

/**
 * The store in figures (Settings › Homepage › Numbers, or its own: products, brands, days to
 * return, free delivery), counting up from nothing when the shopper reaches them. Figures on
 * screen from the start, and for shoppers who ask for less motion, simply stand.
 */
export default function Numbers({ title, figures }: { title: string; figures: Figure[] }) {
  const ref = useRef<HTMLDListElement>(null);
  // null: the figures as they are; 0 to 1: how far they've counted.
  const [t, setT] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) return;
    setT(0);
    let frame = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const k = Math.min(1, (now - start) / 1600);
          setT(k >= 1 ? null : 1 - (1 - k) ** 3);
          if (k < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section aria-label={title} className="container-page mt-20 md:mt-28">
      <p className="label-caps text-center text-accent">{title}</p>
      <dl
        ref={ref}
        className="mt-8 grid grid-cols-[repeat(var(--cols-sm),minmax(0,1fr))] gap-y-10 border-y border-line py-12 md:grid-cols-[repeat(var(--cols),minmax(0,1fr))] md:py-16"
        style={{ "--cols": Math.min(figures.length, 4), "--cols-sm": Math.min(figures.length, 2) } as CSSProperties}
      >
        {figures.map((f, i) => (
          <div key={`${f.label}-${i}`} className="flex flex-col-reverse items-center px-3 text-center">
            <dt className="label-caps mt-3 max-w-[14rem] text-taupe">{f.label}</dt>
            <dd className="font-serif text-[clamp(2.5rem,6vw,4.75rem)] leading-none tabular-nums">
              <span aria-hidden>{t === null ? f.value : countTo(f.value, t)}</span>
              <span className="sr-only">{f.value}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
