"use client";
import Link from "next/link";
import { useState } from "react";
import { optionNames } from "@/lib/store-types";
import { colorsOf, firstColor, sizesOf, variantFor } from "@/lib/variants";
import { quickProduct, type QuickProduct } from "@/server/catalog";
import CatalogImage from "../ui/CatalogImage";
import { Button, cx } from "../ui/controls";
import { Dialog } from "../ui/Dialog";
import { PlusIcon } from "../ui/icons";
import Price from "./Price";
import { useStore } from "./StoreProvider";

/**
 * Quick add: from a product in a list, choose its options and put it in the bag without leaving
 * the page. The product's options are fetched when the shopper asks; a product with only one way
 * to buy it goes straight into the bag.
 */
export default function QuickAdd({ slug, title, className }: { slug: string; title: string; className?: string }) {
  const { addItem, kind } = useStore();
  const [product, setProduct] = useState<QuickProduct | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [color, setColor] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setError(null);
    let p = product;
    if (!p) {
      setLoading(true);
      p = await quickProduct(slug).catch(() => null);
      setLoading(false);
      // Gone from sale since the list was drawn: its page says what happened.
      if (!p) return window.location.assign(`/products/${slug}`);
      setProduct(p);
    }
    if (p.variants.length === 1 && p.variants[0].available > 0) {
      await addItem(p.variants[0].id, 1);
      return;
    }
    const sizes = sizesOf(p.variants);
    setColor(firstColor(colorsOf(p.variants)));
    setSize(sizes.length === 1 ? sizes[0] : null);
    setOpen(true);
  };

  const sheet = (() => {
    if (!product) return null;
    const names = optionNames(kind, product.option_names);
    const colors = colorsOf(product.variants);
    const sizes = sizesOf(product.variants);
    const swatched = colors.some((c) => c.hex);
    const selected = variantFor(product.variants, color, size);
    const add = async () => {
      if (sizes.length && !size) return setError(`Please choose a ${names.size.toLowerCase()}.`);
      if (!selected || selected.available <= 0) return setError("That one is sold out. Please choose another.");
      setOpen(false);
      await addItem(selected.id, 1);
    };
    return (
      <div className="grid gap-5">
        <div className="flex gap-4">
          <div className="relative aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-img bg-bone">
            <CatalogImage src={product.image} alt="" fill sizes="80px" className="object-cover" />
          </div>
          <div className="grid content-start gap-1.5">
            <Price
              price={selected?.price ?? product.min_price}
              compareAt={selected ? selected.compare_at_price : product.min_price_compare_at}
              maxPrice={selected ? undefined : product.max_price}
            />
            <Link href={`/products/${product.slug}`} onClick={() => setOpen(false)} className="text-sm underline underline-offset-4">
              See all details
            </Link>
          </div>
        </div>

        {colors.length > 0 && (
          <fieldset>
            <legend className="text-sm">{names.color}{color ? <>: <span className="text-taupe">{color}</span></> : null}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {colors.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => {
                    setColor(c.name);
                    setError(null);
                  }}
                  aria-pressed={color === c.name}
                  aria-label={`${c.name}${c.available <= 0 ? " (sold out)" : ""}`}
                  title={c.name}
                  style={swatched ? { background: c.hex || "#ccc" } : undefined}
                  className={cx(
                    "relative transition",
                    swatched
                      ? cx("size-9 rounded-full ring-offset-2 ring-offset-ivory", color === c.name ? "ring-2 ring-ink" : "ring-1 ring-black/15 hover:ring-ink/50")
                      : cx("h-10 rounded-btn border px-3.5 text-sm", color === c.name ? "border-brand bg-brand text-on-brand" : "border-line bg-paper hover:border-ink"),
                    c.available <= 0 && !swatched && "text-stone line-through",
                  )}
                >
                  {swatched ? c.available <= 0 && <span className="absolute inset-0 m-auto h-px w-10 -rotate-45 bg-ink/70" aria-hidden /> : c.name}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {sizes.length > 0 && (
          <fieldset>
            <legend className="text-sm">{names.size}{size ? <>: <span className="text-taupe">{size}</span></> : null}</legend>
            <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-2">
              {sizes.map((s) => {
                const v = variantFor(product.variants, color, s);
                const out = !v || v.available <= 0;
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={out}
                    aria-pressed={size === s}
                    aria-label={`${names.size} ${s}${out ? " (sold out)" : ""}`}
                    onClick={() => {
                      setSize(s);
                      setError(null);
                    }}
                    className={cx(
                      "h-10 rounded-btn border text-sm transition",
                      size === s ? "border-brand bg-brand text-on-brand" : "border-line bg-paper hover:border-ink",
                      out && "cursor-not-allowed text-stone/60 line-through hover:border-line",
                    )}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        <div>
          <Button size="lg" className="w-full" onClick={add}>
            Add to bag
          </Button>
          <p className="mt-2 min-h-5 text-sm text-sale" role="alert">{error}</p>
        </div>
      </div>
    );
  })();

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={loading}
        aria-label={`Quick add: ${title}`}
        aria-haspopup="dialog"
        className={cx(
          "pc-quick grid size-9 place-items-center rounded-full bg-paper/90 text-ink shadow-sm backdrop-blur transition hover:bg-paper disabled:opacity-60",
          className,
        )}
      >
        <PlusIcon size={16} className={cx(loading && "animate-spin")} />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={product?.title ?? title} size="sm">
        {sheet}
      </Dialog>
    </>
  );
}
