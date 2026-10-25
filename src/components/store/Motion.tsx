"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import type { MotionStyle } from "@/lib/designs";

/**
 * The design's motion. "subtle": parts marked data-reveal ease in as they scroll into view.
 * "cinematic": that, plus pictures marked data-parallax drifting slower than the page and
 * giant words marked data-drift sliding sideways as it scrolls. The page is complete without
 * this (it only adds movement) and stays still for shoppers who ask their device for less motion.
 */
export default function Motion({ level }: { level: MotionStyle }) {
  const pathname = usePathname();

  useEffect(() => {
    if (level === "none" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.06 },
    );
    // What's on screen already stays as it is; the rest eases in when the shopper reaches it.
    const watch = (el: Element) => {
      if (el.classList.contains("is-in") || el.classList.contains("is-shown")) return;
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) el.classList.add("is-shown");
      else io.observe(el);
    };
    document.querySelectorAll("[data-reveal]").forEach(watch);
    root.classList.add("motion-ready");
    // Parts that arrive later (recommendations, the next page's sections).
    const added = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches("[data-reveal]")) watch(node);
          node.querySelectorAll("[data-reveal]").forEach(watch);
        });
      }
    });
    added.observe(document.body, { childList: true, subtree: true });

    let frame = 0;
    const scene = () => {
      frame = 0;
      const vh = window.innerHeight;
      document.querySelectorAll<HTMLElement>("[data-parallax], [data-drift]").forEach((el) => {
        // A picture is measured by its frame, which doesn't move, so the shift never feeds back on itself.
        const frameEl = el.dataset.parallax !== undefined ? (el.parentElement ?? el) : el;
        const r = frameEl.getBoundingClientRect();
        if (r.bottom < -vh || r.top > vh * 2) return;
        const offset = r.top + r.height / 2 - vh / 2;
        if (el.dataset.parallax !== undefined) {
          // Never further than the picture's enlargement (scale 1.12, so 6% each way) can hide.
          const room = r.height * 0.055;
          const shift = Math.max(-room, Math.min(room, offset * -(Number(el.dataset.parallax) || 0.12)));
          el.style.setProperty("--parallax", `${shift.toFixed(1)}px`);
        }
        if (el.dataset.drift !== undefined) el.style.setProperty("--drift", `${(offset * (Number(el.dataset.drift) || 0.35)).toFixed(1)}px`);
      });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(scene);
    };
    if (level === "cinematic") {
      scene();
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
    }
    return () => {
      io.disconnect();
      added.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
      root.classList.remove("motion-ready");
    };
  }, [level, pathname]);

  return null;
}
