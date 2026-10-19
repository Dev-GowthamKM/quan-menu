"use client";
import { useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "../ui/icons";

/** Horizontal, swipeable row with arrow buttons on larger screens. */
export default function Rail({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: "smooth" });
  return (
    <div className="relative">
      <div
        ref={ref}
        role="region"
        aria-label={label}
        tabIndex={0}
        className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6 md:gap-5 lg:mx-0 lg:scroll-px-0 lg:px-0"
      >
        {children}
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 left-0 hidden items-center justify-between lg:flex">
        <button type="button" onClick={() => scroll(-1)} aria-label="Scroll back" className="pointer-events-auto -ml-5 grid size-10 place-items-center rounded-full border border-line bg-paper/95 shadow-sm hover:border-ink">
          <ChevronLeft size={18} />
        </button>
        <button type="button" onClick={() => scroll(1)} aria-label="Scroll forward" className="pointer-events-auto -mr-5 grid size-10 place-items-center rounded-full border border-line bg-paper/95 shadow-sm hover:border-ink">
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
