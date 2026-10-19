"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { searchSuggestions, type Suggestions } from "@/server/search";
import CatalogImage from "../ui/CatalogImage";
import { Spinner } from "../ui/controls";
import { Dialog } from "../ui/Dialog";
import { ArrowRight, SearchIcon } from "../ui/icons";
import Price from "./Price";

const POPULAR = ["Linen", "Satin dress", "Knitwear", "Kurta", "Leather tote", "Trench coat"];

export default function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Suggestions | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      return;
    }
    const t = setTimeout(() => start(async () => setResults(await searchSuggestions(term))), 220);
    return () => clearTimeout(t);
  }, [q]);

  const go = (term: string) => {
    onClose();
    router.push(`/shop?q=${encodeURIComponent(term.trim())}`);
  };

  return (
    <Dialog open={open} onClose={onClose} side="center" size="lg" className="mt-[8vh] mb-auto">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) go(q);
        }}
        className="flex items-center gap-3 border-b border-line px-5"
      >
        <SearchIcon className="shrink-0 text-stone" />
        <label htmlFor="site-search" className="sr-only">Search the store</label>
        <input
          ref={input}
          id="site-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search for products, brands or SKUs"
          autoComplete="off"
          className="h-16 min-w-0 flex-1 bg-transparent font-serif text-2xl outline-none placeholder:text-stone/60"
        />
        {pending && <Spinner className="size-4 text-stone" />}
        <button type="button" onClick={onClose} className="label-caps text-stone hover:text-ink">Close</button>
      </form>
      <div className="px-5 py-5">
        {!results ? (
          <div>
            <p className="label-caps text-stone">Popular searches</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {POPULAR.map((term) => (
                <button key={term} type="button" onClick={() => go(term)} className="border border-line px-3 py-1.5 text-sm hover:border-ink">
                  {term}
                </button>
              ))}
            </div>
          </div>
        ) : results.total === 0 && !results.categories.length && !results.brands.length ? (
          <p className="py-6 text-center text-taupe">No results for “{q}”. Try a different word or browse <Link href="/shop" onClick={onClose} className="underline">all products</Link>.</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-[1fr_12rem]">
            <ul className="grid gap-3">
              {results.products.map((p) => (
                <li key={p.id}>
                  <Link href={`/products/${p.slug}`} onClick={onClose} className="flex items-center gap-4 hover:bg-bone/60">
                    <span className="relative aspect-[4/5] w-14 shrink-0 overflow-hidden bg-bone">
                      <CatalogImage src={p.image_url} alt="" fill sizes="56px" className="object-cover" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="label-caps block text-stone">{p.brand_name}</span>
                      <span className="block truncate text-sm">{p.title}</span>
                      <Price price={p.price} compareAt={p.compare_at_price} showPercent={false} />
                    </span>
                  </Link>
                </li>
              ))}
              {results.total > results.products.length && (
                <li>
                  <button type="button" onClick={() => go(q)} className="inline-flex items-center gap-2 text-sm underline underline-offset-4">
                    See all {results.total} results <ArrowRight size={16} />
                  </button>
                </li>
              )}
            </ul>
            <div className="grid content-start gap-5 text-sm">
              {results.categories.length > 0 && (
                <div>
                  <p className="label-caps text-stone">Categories</p>
                  <ul className="mt-2 grid gap-1.5">
                    {results.categories.map((c) => (
                      <li key={c.slug}><Link href={`/category/${c.slug}`} onClick={onClose} className="hover:underline">{c.name}</Link></li>
                    ))}
                  </ul>
                </div>
              )}
              {results.brands.length > 0 && (
                <div>
                  <p className="label-caps text-stone">Brands</p>
                  <ul className="mt-2 grid gap-1.5">
                    {results.brands.map((b) => (
                      <li key={b.slug}><Link href={`/brands/${b.slug}`} onClick={onClose} className="hover:underline">{b.name}</Link></li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
