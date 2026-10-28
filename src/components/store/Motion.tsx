"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import type { MotionStyle } from "@/lib/designs";

/** Each word of a rising heading learns which line it's on, so the heading rises line by line. */
function markLines(heading: Element) {
  let top = -Infinity;
  let line = -1;
  heading.querySelectorAll<HTMLElement>(".rise-w").forEach((word) => {
    if (word.offsetTop > top + 4) {
      top = word.offsetTop;
      line++;
    }
    word.style.setProperty("--line", String(line));
  });
}

/**
 * Smooth scrolling for a mouse wheel: the page glides to where the wheel sends it instead of
 * jumping. Only the wheel: keys, the scroll bar, touch and links scroll as they always do (and
 * stop a glide), as does anything that scrolls by itself (a drawer, a menu, a row of products),
 * and nothing glides while a dialog holds the page still. Returns the way to switch it off.
 */
function smoothWheel() {
  let target = 0;
  let current = 0;
  let frame = 0;
  let last = 0;
  const root = document.documentElement;
  const held = () => root.style.overflow === "hidden" || document.body.style.overflow === "hidden" || !!document.querySelector("dialog[open]");
  const scrollsItself = (from: EventTarget | null, dy: number) => {
    for (let el = from instanceof Element ? from : null; el && el !== root && el !== document.body; el = el.parentElement) {
      if (!/(auto|scroll)/.test(getComputedStyle(el).overflowY) || el.scrollHeight <= el.clientHeight + 1) continue;
      if (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
    }
    return false;
  };
  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  };
  const glide = (now: number) => {
    // The same feel at any refresh rate: about nine-tenths of the way in a quarter of a second.
    const dt = last ? Math.min(64, now - last) : 16;
    last = now;
    current += (target - current) * (1 - Math.exp(-dt / 110));
    if (Math.abs(target - current) < 0.5) current = target;
    window.scrollTo(0, current);
    if (current === target) stop();
    else frame = requestAnimationFrame(glide);
  };
  const onWheel = (e: WheelEvent) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || held() || scrollsItself(e.target, e.deltaY)) return;
    e.preventDefault();
    if (!frame) target = current = window.scrollY;
    const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? window.innerHeight : 1;
    target = Math.max(0, Math.min(root.scrollHeight - window.innerHeight, target + e.deltaY * unit));
    if (!frame) frame = requestAnimationFrame(glide);
  };
  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", stop);
  window.addEventListener("pointerdown", stop);
  window.addEventListener("touchstart", stop, { passive: true });
  return () => {
    stop();
    window.removeEventListener("wheel", onWheel);
    window.removeEventListener("keydown", stop);
    window.removeEventListener("pointerdown", stop);
    window.removeEventListener("touchstart", stop);
  };
}

/**
 * The design's motion. "subtle": parts marked data-reveal ease in as they scroll into view.
 * "cinematic": that, plus headings marked data-rise rising line by line, the opening banner
 * (data-zoom) zooming in as the page moves over it, pictures marked data-parallax drifting
 * slower than the page, giant words marked data-drift sliding sideways, and a mouse wheel that
 * glides. The page is complete without this (it only adds movement) and stays still for
 * shoppers who ask their device for less motion.
 */
export default function Motion({ level }: { level: MotionStyle }) {
  const pathname = usePathname();

  useEffect(() => {
    if (level === "none" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cinematic = level === "cinematic";
    const root = document.documentElement;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          if (e.target.matches("[data-rise]")) markLines(e.target);
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
    // Headings on screen from the start rise by themselves (data-rise="load", in CSS alone).
    const selector = cinematic ? '[data-reveal], [data-rise]:not([data-rise="load"])' : "[data-reveal]";
    document.querySelectorAll(selector).forEach(watch);
    root.classList.add("motion-ready");
    // Parts that arrive later (recommendations, the next page's sections).
    const added = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches(selector)) watch(node);
          node.querySelectorAll(selector).forEach(watch);
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
      // How far the shopper has scrolled past the opening banner, 0 to 1 (it doesn't move itself; its stage does).
      document.querySelectorAll<HTMLElement>("[data-zoom]").forEach((el) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--zoom", Math.min(1, Math.max(0, -r.top / Math.max(1, r.height))).toFixed(3));
      });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(scene);
    };
    let glideOff: (() => void) | undefined;
    if (cinematic) {
      scene();
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) glideOff = smoothWheel();
    }
    return () => {
      io.disconnect();
      added.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
      glideOff?.();
      root.classList.remove("motion-ready");
    };
  }, [level, pathname]);

  return null;
}
