"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "../ui/controls";

/** A header that slides away while the shopper scrolls down and comes back when they scroll up. */
export function AutoHideHeader({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const focused = ref.current?.contains(document.activeElement);
      setHidden(y > 160 && y > last && !focused);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header
      ref={ref}
      onFocus={() => setHidden(false)}
      className={cx(className, "transition-transform duration-300 motion-reduce:transition-none", hidden && "-translate-y-full")}
    >
      {children}
    </header>
  );
}

/**
 * A header that can sit over the home page's opening banner (a full-screen photograph or a
 * glowing scene) and turns solid once the shopper scrolls; elsewhere it's an ordinary sticky
 * header. "overlay": see-through with light words; "glass": frosted glass; "floating": a
 * frosted capsule that floats free of the page's edges (its own look is set by its contents).
 */
export function OverlayHeader({
  overlayOnHome,
  onPhoto = true,
  mode = "overlay",
  top,
  children,
}: {
  overlayOnHome: boolean;
  /** The banner under it is a photograph (light words read best over it). */
  onPhoto?: boolean;
  mode?: "overlay" | "glass" | "floating";
  top?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const overlay = overlayOnHome && pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  // Notices above the header (a look preview, a setup warning) push it down until they scroll away.
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (!overlay) return;
    const onScroll = () => {
      setScrolled(window.scrollY > 24);
      const above = Array.from(document.querySelectorAll<HTMLElement>("[data-above-header]")).reduce((n, el) => n + el.offsetHeight, 0);
      setOffset(Math.max(0, above - window.scrollY));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [overlay]);
  const clear = overlay && !scrolled;
  // Light words over a photograph; over a glowing scene (in the store's own colours), its text colour.
  const see = cx("overlay-clear bg-transparent", onPhoto ? "on-photo text-white [text-shadow:0_1px_14px_rgb(0_0_0/0.4)]" : "text-ink");
  const look = {
    overlay: clear ? see : "border-b border-line bg-ivory/95 text-ink backdrop-blur supports-[backdrop-filter]:bg-ivory/90",
    glass: clear ? see : "border-b border-line bg-ivory/75 text-ink backdrop-blur-xl supports-[backdrop-filter]:bg-ivory/60",
    floating: cx("text-ink", clear && "overlay-clear", clear && onPhoto && "on-photo"),
  }[mode];
  return (
    <header
      style={overlay && offset ? { top: offset } : undefined}
      className={cx(overlay ? "fixed inset-x-0 top-0" : "sticky top-0", "z-40 transition-colors duration-300", look)}
    >
      {top}
      {children}
    </header>
  );
}
