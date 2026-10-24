"use client";
import { useEffect, useState } from "react";
import { getProductCards, getRecommendations } from "@/server/catalog";
import type { ProductCard as Card } from "@/lib/types";
import ProductCard from "./ProductCard";
import Rail from "./Rail";
import { SectionHeader } from "./SectionHeader";

const KEY = "taana_recently_viewed";

// Recently viewed product ids are a browsing convenience kept in this browser only.
export function readRecentlyViewed(): string[] {
  try {
    const ids = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(ids) ? ids.filter((x) => typeof x === "string").slice(0, 12) : [];
  } catch {
    return [];
  }
}

export function rememberViewed(productId: string) {
  try {
    const ids = [productId, ...readRecentlyViewed().filter((id) => id !== productId)].slice(0, 12);
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Storage blocked (private mode): nothing to remember.
  }
}

export default function RecentlyViewed({ title, mode = "recent", excludeId }: { title: string; mode?: "recent" | "recommend"; excludeId?: string }) {
  const [items, setItems] = useState<Card[] | null>(null);

  useEffect(() => {
    const ids = readRecentlyViewed().filter((id) => id !== excludeId);
    if (mode === "recent" && ids.length === 0) {
      setItems([]);
      return;
    }
    (mode === "recent" ? getProductCards(ids) : getRecommendations(ids)).then(setItems).catch(() => setItems([]));
  }, [mode, excludeId]);

  if (!items || items.length === 0) return null;
  return (
    <section className="container-page mt-20 md:mt-28">
      <SectionHeader eyebrow={mode === "recent" ? "Your history" : "Picked for you"} title={title} />
      <Rail label={title}>
        {items.map((p) => (
          <ProductCard key={p.id} product={p} className="w-[46vw] shrink-0 snap-start sm:w-[32vw] md:w-[23vw] xl:w-[19rem]" sizes="(min-width: 1280px) 19rem, (min-width: 768px) 23vw, 46vw" />
        ))}
      </Rail>
    </section>
  );
}
