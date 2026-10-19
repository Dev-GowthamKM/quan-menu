"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PageImage } from "@/lib/types";
import CatalogImage from "../../ui/CatalogImage";
import { cx } from "../../ui/controls";
import { Dialog } from "../../ui/Dialog";
import { ChevronLeft, ChevronRight, ZoomIcon } from "../../ui/icons";

/**
 * Product images: thumbnails and a hover-zoom main image on desktop, a swipeable strip
 * on phones, and a full-screen viewer with 2x zoom on any device. Images tagged with the
 * selected colour come first.
 */
export default function Gallery({ images, title, color }: { images: PageImage[]; title: string; color: string | null }) {
  const ordered = useMemo(() => {
    if (!color) return images;
    const mine = images.filter((i) => i.color === color);
    if (!mine.length) return images;
    return [...mine, ...images.filter((i) => !i.color), ...images.filter((i) => i.color && i.color !== color)];
  }, [images, color]);
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [viewer, setViewer] = useState(false);
  const [viewerZoom, setViewerZoom] = useState(false);
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActive(0);
    strip.current?.scrollTo({ left: 0 });
  }, [color]);

  if (!ordered.length) {
    return <div className="aspect-[4/5] bg-bone" aria-label="No image available" />;
  }
  const current = ordered[Math.min(active, ordered.length - 1)];
  const go = (i: number) => setActive((i + ordered.length) % ordered.length);

  return (
    <div>
      {/* Phones: swipe through every image */}
      <div className="lg:hidden">
        <div
          ref={strip}
          className="scrollbar-none -mx-4 flex snap-x snap-mandatory overflow-x-auto sm:-mx-6"
          onScroll={(e) => {
            const el = e.currentTarget;
            setActive(Math.round(el.scrollLeft / el.clientWidth));
          }}
          aria-label={`${title} images`}
        >
          {ordered.map((img, i) => (
            <button key={img.id} type="button" onClick={() => { setActive(i); setViewer(true); }} className="relative aspect-[4/5] w-full shrink-0 snap-center bg-bone" aria-label={`Open image ${i + 1} of ${ordered.length}`}>
              <CatalogImage src={img.url} alt={img.alt || title} fill sizes="100vw" priority={i === 0} className="object-cover" />
            </button>
          ))}
        </div>
        {ordered.length > 1 && (
          <div className="mt-3 flex justify-center gap-1.5" aria-hidden>
            {ordered.map((img, i) => (
              <span key={img.id} className={cx("h-1 rounded-full transition-all", i === active ? "w-6 bg-ink" : "w-2 bg-ink/25")} />
            ))}
          </div>
        )}
      </div>

      {/* Desktop: thumbnails + zoomable main image */}
      <div className="hidden gap-4 lg:grid lg:grid-cols-[4.5rem_1fr]">
        <ul className="grid content-start gap-3" aria-label="Choose image">
          {ordered.map((img, i) => (
            <li key={img.id}>
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show image ${i + 1}`}
                aria-current={i === active}
                className={cx("relative block aspect-[4/5] w-full overflow-hidden bg-bone ring-offset-2 ring-offset-ivory transition", i === active ? "ring-1 ring-ink" : "opacity-70 hover:opacity-100")}
              >
                <CatalogImage src={img.url} alt="" fill sizes="72px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
        <div className="relative">
          <button
            type="button"
            className="relative block aspect-[4/5] w-full cursor-zoom-in overflow-hidden bg-bone"
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
            }}
            onMouseLeave={() => setZoom(null)}
            onClick={() => setViewer(true)}
            aria-label="Open full-screen view"
          >
            <CatalogImage
              src={current.url}
              alt={current.alt || title}
              fill
              priority
              sizes="(min-width: 1280px) 46vw, 55vw"
              className="object-cover transition-transform duration-200 ease-out"
              style={zoom ? { transform: "scale(2)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
            />
          </button>
          <span className="pointer-events-none absolute right-4 bottom-4 inline-flex items-center gap-1.5 bg-paper/90 px-2.5 py-1.5 text-[11px] tracking-wider uppercase">
            <ZoomIcon size={14} /> Hover to zoom
          </span>
          {ordered.length > 1 && (
            <>
              <button type="button" onClick={() => go(active - 1)} aria-label="Previous image" className="absolute top-1/2 left-3 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-paper/90 hover:bg-paper">
                <ChevronLeft size={18} />
              </button>
              <button type="button" onClick={() => go(active + 1)} aria-label="Next image" className="absolute top-1/2 right-3 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-paper/90 hover:bg-paper">
                <ChevronRight size={18} />
              </button>
            </>
          )}
        </div>
      </div>

      <Dialog open={viewer} onClose={() => { setViewer(false); setViewerZoom(false); }} side="center" size="xl" title={`${title} (${active + 1}/${ordered.length})`}>
        <div className="relative bg-bone">
          <div className={cx("relative mx-auto aspect-[4/5] max-h-[78dvh] overflow-auto", viewerZoom ? "cursor-zoom-out" : "cursor-zoom-in")}>
            <button type="button" onClick={() => setViewerZoom((z) => !z)} className={cx("relative block", viewerZoom ? "h-[200%] w-[200%]" : "size-full")} aria-label={viewerZoom ? "Zoom out" : "Zoom in"}>
              <CatalogImage src={current.url} alt={current.alt || title} fill sizes="(min-width: 1024px) 64rem, 100vw" quality={90} className="object-cover" />
            </button>
          </div>
          {ordered.length > 1 && (
            <>
              <button type="button" onClick={() => go(active - 1)} aria-label="Previous image" className="absolute top-1/2 left-3 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-paper/90">
                <ChevronLeft />
              </button>
              <button type="button" onClick={() => go(active + 1)} aria-label="Next image" className="absolute top-1/2 right-3 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-paper/90">
                <ChevronRight />
              </button>
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
}
