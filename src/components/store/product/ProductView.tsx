"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { checkDelivery, type DeliveryCheck } from "@/server/catalog";
import { discountPercent, formatMoney } from "@/lib/money";
import type { PageVariant, ProductPage, SizeGuide } from "@/lib/types";
import { Button, cx } from "../../ui/controls";
import { Dialog } from "../../ui/Dialog";
import { CheckIcon, MapPinIcon, MinusIcon, PlusIcon, ReturnIcon, RulerIcon, ShareIcon, StarIcon, TruckIcon } from "../../ui/icons";
import { rememberViewed } from "../RecentlyViewed";
import { useStore } from "../StoreProvider";
import WishButton from "../WishButton";
import BackInStock from "./BackInStock";
import Gallery from "./Gallery";

const LOW_STOCK = 3;

function sizeOrder(variants: PageVariant[]) {
  const seen: string[] = [];
  for (const v of variants) if (v.size && !seen.includes(v.size)) seen.push(v.size);
  return seen;
}

export default function ProductView({ product, currency, preview, stockAlerts }: { product: ProductPage; currency: string; preview?: boolean; stockAlerts?: boolean }) {
  const router = useRouter();
  const search = useSearchParams();
  const { addItem } = useStore();

  const colors = useMemo(() => {
    const list: { name: string; hex: string | null; available: number }[] = [];
    for (const v of product.variants) {
      if (!v.color) continue;
      const existing = list.find((c) => c.name === v.color);
      if (existing) existing.available += v.available;
      else list.push({ name: v.color, hex: v.color_hex, available: v.available });
    }
    return list;
  }, [product.variants]);
  const sizes = useMemo(() => sizeOrder(product.variants), [product.variants]);

  const initialColor = (() => {
    const wanted = search.get("color");
    if (wanted && colors.some((c) => c.name === wanted)) return wanted;
    return colors.find((c) => c.available > 0)?.name ?? colors[0]?.name ?? null;
  })();
  const [color, setColor] = useState<string | null>(initialColor);
  const [size, setSize] = useState<string | null>(() => {
    const wanted = search.get("size");
    if (wanted && sizes.includes(wanted)) return wanted;
    return sizes.length === 1 ? sizes[0] : null;
  });
  const [qty, setQty] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"add" | "buy" | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    rememberViewed(product.id);
  }, [product.id]);

  const variantFor = (c: string | null, s: string | null) =>
    product.variants.find((v) => (v.color || null) === (colors.length ? c : null) && (v.size || null) === (sizes.length ? s : null));

  const selected = variantFor(color, size);
  const needsSize = sizes.length > 0 && !size;
  const price = selected?.price ?? product.min_price;
  const compareAt = selected ? selected.compare_at_price : product.min_price_compare_at;
  const pct = discountPercent(price, compareAt);
  const soldOut = product.available_stock <= 0;
  // Sizes that can be requested by email: in the chosen colour, or every variant when all are gone.
  const soldOutSizes = product.variants
    .filter((v) => v.available <= 0 && (soldOut || !colors.length || (v.color || null) === color))
    .map((v) => ({ id: v.id, label: [soldOut && colors.length > 1 ? v.color : "", v.size || ""].filter(Boolean).join(" · ") || "One size" }));

  const pickColor = (name: string) => {
    setColor(name);
    setError(null);
    const q = new URLSearchParams(search.toString());
    q.set("color", name);
    window.history.replaceState(null, "", `?${q.toString()}`);
  };

  const submit = async (mode: "add" | "buy") => {
    if (needsSize) return setError("Please choose a size.");
    if (colors.length && !color) return setError("Please choose a colour.");
    if (!selected) return setError("That combination isn't available.");
    if (selected.available <= 0) return setError("This size is sold out.");
    if (qty > selected.available) return setError(`Only ${selected.available} left in this size.`);
    setError(null);
    setBusy(mode);
    const ok = await addItem(selected.id, qty);
    setBusy(null);
    if (ok && mode === "buy") router.push("/checkout");
  };

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: product.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setShared(true);
        setTimeout(() => setShared(false), 2500);
      }
    } catch {
      // The customer closed the share sheet.
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-14 xl:gap-20">
      <Gallery images={product.images} title={product.title} color={color} />

      <div className="lg:sticky lg:top-36 lg:self-start">
        {preview && (
          <p className="mb-4 border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Preview: this product is {product.status === "active" ? "scheduled" : product.status} and not visible to customers.
          </p>
        )}
        {product.brand && (
          <Link href={`/brands/${product.brand.slug}`} className="label-caps text-stone hover:text-ink">
            {product.brand.name}
          </Link>
        )}
        <h1 className="mt-2 font-serif text-4xl leading-tight md:text-5xl">{product.title}</h1>

        {product.rating_count > 0 && (
          <a href="#reviews" className="mt-3 inline-flex items-center gap-2 text-sm text-taupe hover:text-ink">
            <span className="flex text-ink" aria-hidden>
              {[1, 2, 3, 4, 5].map((i) => (
                <StarIcon key={i} size={14} filled={i <= Math.round(Number(product.rating_avg))} />
              ))}
            </span>
            <span>
              {Number(product.rating_avg).toFixed(1)} · {product.rating_count} {product.rating_count === 1 ? "review" : "reviews"}
            </span>
          </a>
        )}

        <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={cx("text-2xl tabular-nums", pct > 0 && "text-sale")}>{formatMoney(price, currency)}</span>
          {pct > 0 && (
            <>
              <span className="text-base text-stone line-through tabular-nums"><span className="sr-only">Was </span>{formatMoney(compareAt!, currency)}</span>
              <span className="text-sm text-sale">Save {pct}%</span>
            </>
          )}
        </div>
        <p className="mt-1 text-xs text-stone">Inclusive of all taxes</p>

        {colors.length > 0 && (
          <fieldset className="mt-8">
            <legend className="text-sm">
              Colour: <span className="text-taupe">{color}</span>
            </legend>
            <div className="mt-3 flex flex-wrap gap-2.5">
              {colors.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => pickColor(c.name)}
                  aria-pressed={color === c.name}
                  aria-label={`${c.name}${c.available <= 0 ? " (sold out)" : ""}`}
                  title={c.name}
                  className={cx(
                    "relative size-9 rounded-full ring-offset-2 ring-offset-ivory transition",
                    color === c.name ? "ring-2 ring-ink" : "ring-1 ring-black/15 hover:ring-ink/50",
                  )}
                  style={{ background: c.hex || "#ccc" }}
                >
                  {c.available <= 0 && <span className="absolute inset-0 m-auto h-px w-10 -rotate-45 bg-ink/70" aria-hidden />}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {sizes.length > 0 && (
          <fieldset className="mt-7">
            <div className="flex items-center justify-between">
              <legend className="text-sm">
                Size{size ? <>: <span className="text-taupe">{size}</span></> : null}
              </legend>
              {product.size_guide && (
                <button type="button" onClick={() => setGuideOpen(true)} className="inline-flex items-center gap-1.5 text-xs underline underline-offset-4">
                  <RulerIcon size={15} /> Size guide
                </button>
              )}
            </div>
            <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-2">
              {sizes.map((s) => {
                const v = variantFor(color, s);
                const out = !v || v.available <= 0;
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={out}
                    aria-pressed={size === s}
                    aria-label={`Size ${s}${out ? " (sold out)" : ""}`}
                    onClick={() => {
                      setSize(s);
                      setError(null);
                      if (v && qty > v.available) setQty(Math.max(1, v.available));
                    }}
                    className={cx(
                      "relative h-11 border text-sm transition",
                      size === s ? "border-ink bg-ink text-ivory" : "border-line bg-paper hover:border-ink",
                      out && "cursor-not-allowed text-stone/60 line-through hover:border-line",
                    )}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
            {selected && selected.available > 0 && selected.available <= LOW_STOCK && (
              <p className="mt-3 text-sm text-sale">Only {selected.available} left in this size</p>
            )}
            {stockAlerts && !soldOut && !preview && <BackInStock key={color ?? ""} options={soldOutSizes} />}
          </fieldset>
        )}
        {stockAlerts && soldOut && !preview && <BackInStock key={`all-${color ?? ""}`} options={soldOutSizes} open />}

        <div className="mt-8 flex items-stretch gap-3">
          <div className="flex items-center border border-line bg-paper" role="group" aria-label="Quantity">
            <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} className="grid h-12 w-10 place-items-center disabled:opacity-30" aria-label="Decrease quantity">
              <MinusIcon size={14} />
            </button>
            <span className="w-8 text-center tabular-nums" aria-live="polite">{qty}</span>
            <button
              type="button"
              onClick={() => setQty((q) => Math.min(q + 1, Math.min(selected?.available ?? 10, 10)))}
              disabled={qty >= Math.min(selected?.available ?? 10, 10)}
              className="grid h-12 w-10 place-items-center disabled:opacity-30"
              aria-label="Increase quantity"
            >
              <PlusIcon size={14} />
            </button>
          </div>
          <Button size="lg" className="h-12! flex-1" onClick={() => submit("add")} busy={busy === "add"} disabled={soldOut || preview}>
            {soldOut ? "Sold out" : "Add to bag"}
          </Button>
          <WishButton productId={product.id} title={product.title} className="h-12 w-12 rounded-none border border-line bg-paper shadow-none" />
        </div>
        {!soldOut && (
          <Button variant="secondary" size="lg" className="mt-3 h-12! w-full" onClick={() => submit("buy")} busy={busy === "buy"} disabled={preview}>
            Buy now
          </Button>
        )}
        <p className="mt-3 min-h-5 text-sm text-sale" role="alert" aria-live="assertive">{error}</p>

        <DeliveryChecker />

        <ul className="mt-6 grid gap-3 border-t border-line pt-6 text-sm text-taupe">
          <li className="flex items-center gap-3"><TruckIcon size={18} className="text-ink" /> Tracked delivery across India</li>
          <li className="flex items-center gap-3">
            <ReturnIcon size={18} className="text-ink" />
            {product.is_returnable ? `Free returns within ${product.return_window_days ?? 15} days of delivery` : "This item cannot be returned"}
          </li>
          <li>
            <button type="button" onClick={share} className="flex items-center gap-3 hover:text-ink">
              <ShareIcon size={18} className="text-ink" /> {shared ? "Link copied" : "Share this product"}
            </button>
          </li>
        </ul>
      </div>

      {product.size_guide && <SizeGuideDialog guide={product.size_guide} open={guideOpen} onClose={() => setGuideOpen(false)} />}
    </div>
  );
}

function DeliveryChecker() {
  const [pin, setPin] = useState("");
  const [result, setResult] = useState<DeliveryCheck | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("taana_pin");
      if (saved) setPin(saved);
    } catch {}
  }, []);

  return (
    <div className="mt-4 border border-line bg-paper p-4">
      <form
        className="flex items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await checkDelivery(pin);
          setResult(r);
          setBusy(false);
          if (r.ok) try { localStorage.setItem("taana_pin", pin); } catch {}
        }}
      >
        <MapPinIcon size={18} className="shrink-0" />
        <label htmlFor="pin" className="sr-only">Delivery PIN code</label>
        <input
          id="pin"
          inputMode="numeric"
          maxLength={6}
          placeholder="Enter PIN code for delivery dates"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-stone"
        />
        <button type="submit" disabled={busy || pin.length !== 6} className="text-xs tracking-[0.12em] uppercase underline underline-offset-4 disabled:no-underline disabled:opacity-40">
          {busy ? "Checking" : "Check"}
        </button>
      </form>
      {result && (
        <div className="mt-3 border-t border-line pt-3 text-sm" aria-live="polite">
          {!result.ok ? (
            <p className="text-sale">{result.message}</p>
          ) : (
            <ul className="grid gap-1.5">
              {result.options?.map((o) => (
                <li key={o.name} className="flex flex-wrap justify-between gap-x-3">
                  <span><CheckIcon size={14} className="mr-1 inline text-ok" />{o.name}: {o.from === o.to ? o.from : `${o.from} – ${o.to}`}</span>
                </li>
              ))}
              {result.courierEta && <li><TruckIcon size={14} className="mr-1 inline" />Usually delivered by {result.courierEta}</li>}
              <li className="text-taupe">{result.cod ? "Cash on delivery available" : "Prepaid orders only for this PIN code"}</li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function SizeGuideDialog({ guide, open, onClose }: { guide: SizeGuide; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Size guide" size="lg">
      <div className="p-5 md:p-8">
        <p className="font-serif text-2xl">{guide.name}</p>
        {guide.description && <p className="mt-2 text-sm text-taupe">{guide.description}</p>}
        <div className="relative mt-6 overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-sm">
            <caption className="sr-only">Measurements in {guide.unit === "in" ? "inches" : "centimetres"}</caption>
            <thead>
              <tr className="border-b border-ink">
                {guide.columns.map((c) => (
                  <th key={c} scope="col" className="py-2 pr-4 text-left font-medium">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {guide.rows.map((row, i) => (
                <tr key={i} className="border-b border-line">
                  {row.map((cell, j) => (j === 0 ? <th key={j} scope="row" className="py-2.5 pr-4 text-left font-medium">{cell}</th> : <td key={j} className="py-2.5 pr-4 tabular-nums">{cell}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-stone">Measurements in {guide.unit === "in" ? "inches" : "centimetres"}. Body measurements, not garment.</p>
        {guide.how_to_measure && (
          <div className="mt-6 bg-bone/60 p-4 text-sm leading-relaxed">
            <p className="label-caps mb-2">How to measure</p>
            {guide.how_to_measure}
          </div>
        )}
      </div>
    </Dialog>
  );
}
