"use client";
import { useEffect, useRef, useState } from "react";
import type { PageImage } from "@/lib/types";
import CatalogImage from "../../ui/CatalogImage";
import { cx } from "../../ui/controls";

/** The fewest photos that make a 360° view; with fewer, the product page shows them as photos. */
export const SPIN_MIN = 8;

/**
 * A product turned by hand: photos taken all the way round, in order, shown one at a time as
 * the shopper drags across (or uses the arrow keys). It turns once by itself when it first
 * comes into view, unless the shopper's device asks for less motion.
 */
export default function SpinViewer({ frames, title }: { frames: PageImage[]; title: string }) {
  const n = frames.length;
  const [frame, setFrame] = useState(0);
  const [touched, setTouched] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; from: number } | null>(null);
  const turn = (to: number) => setFrame(((to % n) + n) % n);

  // One slow turn on first sight, to show it can be turned.
  useEffect(() => {
    const el = box.current;
    if (!el || touched || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || timer) return;
        io.disconnect();
        let step = 0;
        timer = window.setInterval(() => {
          step += 1;
          setFrame(step % n);
          if (step >= n) window.clearInterval(timer);
        }, Math.max(70, 2000 / n));
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearInterval(timer);
    };
  }, [n, touched]);

  return (
    <div
      ref={box}
      role="slider"
      tabIndex={0}
      aria-label={`${title}: 360° view`}
      aria-valuemin={1}
      aria-valuemax={n}
      aria-valuenow={frame + 1}
      aria-valuetext={`View ${frame + 1} of ${n}`}
      data-spin
      className="relative aspect-[4/5] w-full cursor-grab touch-pan-y overflow-hidden rounded-img bg-bone select-none active:cursor-grabbing"
      onPointerDown={(e) => {
        setTouched(true);
        drag.current = { x: e.clientX, from: frame };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        // Dragging across the whole picture turns it once.
        const step = e.currentTarget.clientWidth / n;
        turn(drag.current.from - Math.round((e.clientX - drag.current.x) / step));
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onKeyDown={(e) => {
        const to = { ArrowRight: frame + 1, ArrowUp: frame + 1, ArrowLeft: frame - 1, ArrowDown: frame - 1, Home: 0, End: n - 1 }[e.key];
        if (to === undefined) return;
        e.preventDefault();
        setTouched(true);
        turn(to);
      }}
    >
      {frames.map((f, i) => (
        <CatalogImage
          key={f.id}
          src={f.url}
          alt=""
          fill
          priority={i === 0}
          draggable={false}
          sizes="(min-width: 1024px) 50vw, 100vw"
          className={cx("pointer-events-none object-cover", i === frame ? "opacity-100" : "opacity-0")}
        />
      ))}
      <span className="label-caps pointer-events-none absolute top-3 left-3 rounded-badge bg-paper/90 px-2 py-1 text-ink">360°</span>
      <span
        aria-hidden
        className={cx(
          "pointer-events-none absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-btn bg-paper/90 px-3.5 py-2 text-xs text-ink shadow-sm transition-opacity duration-500",
          touched && "opacity-0",
        )}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 4 0 0 0 18 0M21 12a9 4 0 0 0-14.5-3.2" />
          <path d="M8 6.2 6.5 8.8 9.4 9.6" />
        </svg>
        Drag to turn
      </span>
    </div>
  );
}
