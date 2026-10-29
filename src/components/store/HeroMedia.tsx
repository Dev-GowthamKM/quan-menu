"use client";
import { useEffect, useRef, useState } from "react";
import CatalogImage from "../ui/CatalogImage";
import { cx } from "../ui/controls";

/** Whether this browser should play a banner film: not on saver or very slow connections, nor for shoppers who ask for less motion. */
function filmAllowed() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !(connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? ""));
}

/**
 * A banner's picture, or its film: muted, looping and playing in place, over the picture,
 * which shows until the film can play and instead of it where films don't suit (see
 * filmAllowed). Moving pictures can always be paused.
 */
export default function HeroMedia({
  image,
  video,
  alt,
  sizes,
  priority,
  className = "object-cover",
  parallax,
}: {
  image?: string | null;
  video?: string | null;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
  /** Drift speed in cinematic designs (Motion.tsx). */
  parallax?: number;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [play, setPlay] = useState(false);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (video && filmAllowed()) setPlay(true);
  }, [video]);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
      setPaused(false);
    } else {
      v.pause();
      setPaused(true);
    }
  };

  return (
    <>
      {image ? (
        <CatalogImage src={image} alt={alt} fill priority={priority} fetchPriority={priority ? "high" : undefined} sizes={sizes} className={className} data-parallax={parallax} />
      ) : (
        <span aria-hidden className="absolute inset-0 bg-bone" />
      )}
      {play && video && (
        <>
          <video
            ref={ref}
            src={video}
            muted
            loop
            playsInline
            autoPlay
            preload="auto"
            aria-hidden
            onCanPlay={() => setReady(true)}
            onError={() => setPlay(false)}
            data-parallax={parallax}
            className={cx("absolute inset-0 size-full transition-opacity duration-700", className, ready ? "opacity-100" : "opacity-0")}
          />
          <button
            type="button"
            onClick={toggle}
            aria-pressed={paused}
            aria-label="Pause the film"
            className="absolute right-4 bottom-4 z-10 grid size-9 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm transition hover:bg-black/60"
          >
            <svg viewBox="0 0 12 12" className="size-3" fill="currentColor" aria-hidden>
              {paused ? <path d="M3 1.5v9l7.5-4.5z" /> : <path d="M2.5 1.5h2.5v9H2.5zM7 1.5h2.5v9H7z" />}
            </svg>
          </button>
        </>
      )}
    </>
  );
}
