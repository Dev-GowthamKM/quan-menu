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
 * A header that sits see-through over a full-screen photograph at the top of the home page
 * and turns solid once the shopper scrolls; elsewhere it's an ordinary sticky header.
 */
export function OverlayHeader({ overlayOnHome, top, children }: { overlayOnHome: boolean; top?: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const overlay = overlayOnHome && pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!overlay) return;
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [overlay]);
  const clear = overlay && !scrolled;
  return (
    <header
      className={cx(
        overlay ? "fixed inset-x-0 top-0" : "sticky top-0",
        "z-40 transition-colors duration-300",
        clear
          ? "overlay-clear bg-transparent text-white [text-shadow:0_1px_14px_rgb(0_0_0/0.4)]"
          : "border-b border-line bg-ivory/95 text-ink backdrop-blur supports-[backdrop-filter]:bg-ivory/90",
      )}
    >
      {top}
      {children}
    </header>
  );
}
