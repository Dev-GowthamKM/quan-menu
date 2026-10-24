"use client";
import { useEffect, useState, type CSSProperties } from "react";
import type { AnnouncementStyle } from "@/lib/designs";
import { cx } from "../ui/controls";

/**
 * The announcement bar. Several messages (separated by | in Settings › Homepage) take turns
 * every few seconds, or scroll past in a marquee. Moving text can be paused, and stays still
 * for shoppers who ask their device for less motion.
 */
export default function Announcement({ text, variant }: { text?: string; variant: AnnouncementStyle }) {
  const messages = (text ?? "").split("|").map((m) => m.trim()).filter(Boolean);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setStill(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // A marquee scrolls even one message; other bars move only to take turns between several.
  const moving = !still && (variant === "marquee" || messages.length > 1);
  useEffect(() => {
    if (!moving || paused || variant === "marquee") return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % messages.length), 5000);
    return () => clearInterval(timer);
  }, [moving, paused, variant, messages.length]);

  if (!messages.length) return null;
  const pause = moving && (
    <button
      type="button"
      onClick={() => setPaused((p) => !p)}
      aria-pressed={paused}
      aria-label={paused ? "Play announcements" : "Pause announcements"}
      className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-full opacity-70 hover:opacity-100"
    >
      <svg viewBox="0 0 12 12" className="size-2.5" fill="currentColor" aria-hidden>
        {paused ? <path d="M3 1.5v9l7.5-4.5z" /> : <path d="M2.5 1.5h2.5v9H2.5zM7 1.5h2.5v9H7z" />}
      </svg>
    </button>
  );

  if (variant === "marquee" && moving) {
    // Enough copies that one pass is wider than any screen, twice over for a seamless loop.
    const repeat = Math.max(1, Math.ceil(280 / messages.join("").length));
    const run = Array.from({ length: repeat }, () => messages).flat();
    return (
      <div className="announce relative overflow-hidden bg-brand text-on-brand">
        <p className="sr-only">{messages.join(". ")}</p>
        <div
          aria-hidden
          className={cx("flex w-max animate-marquee", paused && "[animation-play-state:paused]")}
          style={{ "--marquee-duration": `${Math.round(run.join("").length * 0.25 + 12)}s` } as CSSProperties}
        >
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0 items-center">
              {run.map((m, k) => (
                <span key={k} className="flex items-center gap-6 py-2.5 pr-6 text-[11px] font-semibold tracking-[0.14em] whitespace-nowrap uppercase">
                  {m}
                  <span aria-hidden>✦</span>
                </span>
              ))}
            </div>
          ))}
        </div>
        {pause}
      </div>
    );
  }

  const tone = variant === "slim" ? "border-b border-line bg-bone text-taupe" : "bg-brand text-on-brand";
  return (
    <div className={cx("announce relative px-10 text-center text-[11px] tracking-[0.16em] uppercase", variant === "slim" ? "py-1.5" : "py-2", tone)}>
      {moving ? (
        <p key={index} className="animate-fade-in" aria-live="off">{messages[index]}</p>
      ) : (
        <p>{messages.join(" · ")}</p>
      )}
      {pause}
    </div>
  );
}
