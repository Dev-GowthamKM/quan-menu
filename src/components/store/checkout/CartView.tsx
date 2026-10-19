"use client";
import Link from "next/link";
import { useState } from "react";
import { applyCoupon, updateCartItem } from "@/server/cart";
import { formatMoney } from "@/lib/money";
import type { CartQuote } from "@/lib/types";
import CatalogImage from "../../ui/CatalogImage";
import { Button, ButtonLink, cx, Input, Notice } from "../../ui/controls";
import { LockIcon, MinusIcon, PlusIcon, ShieldIcon, TruckIcon } from "../../ui/icons";
import RecentlyViewed from "../RecentlyViewed";
import { useStore } from "../StoreProvider";

export default function CartView({ initial }: { initial: CartQuote }) {
  const { toast } = useStore();
  const [quote, setQuote] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const c = quote.currency;

  const change = async (variantId: string, qty: number) => {
    setBusy(variantId);
    const res = await updateCartItem(variantId, qty);
    setBusy(null);
    if (res.ok) setQuote(res.data);
    else toast(res.error, "error");
  };

  const coupon = async (value: string) => {
    setBusy("coupon");
    const res = await applyCoupon(value);
    setBusy(null);
    if (res.ok) {
      setQuote(res.data);
      if (value && res.data.coupon && !res.data.coupon.valid) toast(res.data.coupon.message, "error");
      setCode("");
    } else toast(res.error, "error");
  };

  if (!quote.line_count) {
    return (
      <div className="container-page py-24 text-center">
        <h1 className="font-serif text-5xl">Your bag is empty</h1>
        <p className="mt-4 text-taupe">Pieces you add will appear here.</p>
        <ButtonLink href="/shop?sort=newest" size="lg" className="mt-8">Shop new arrivals</ButtonLink>
        <RecentlyViewed title="Recently viewed" />
      </div>
    );
  }

  const freeLeft = quote.free_shipping_remaining ?? 0;
  const threshold = quote.free_shipping_threshold ?? 0;

  return (
    <div className="container-page py-10 md:py-14">
      <h1 className="font-serif text-4xl md:text-5xl">Your bag <span className="text-2xl text-stone">({quote.item_count})</span></h1>
      <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div>
          {quote.issues.length > 0 && (
            <Notice tone="warning" className="mb-6">
              <ul className="grid gap-1">{quote.issues.map((i, n) => <li key={n}>{i.message}</li>)}</ul>
            </Notice>
          )}
          <ul className="divide-y divide-line border-y border-line">
            {quote.lines.map((l) => (
              <li key={l.variant_id} className="flex gap-4 py-6 md:gap-6">
                <Link href={`/products/${l.slug}`} className="relative aspect-[4/5] w-24 shrink-0 overflow-hidden bg-bone md:w-32">
                  <CatalogImage src={l.image_url} alt={l.title} fill sizes="128px" className="object-cover" />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex justify-between gap-4">
                    <div className="min-w-0">
                      <p className="label-caps text-stone">{l.brand}</p>
                      <Link href={`/products/${l.slug}`} className="mt-1 block font-serif text-xl hover:underline">{l.title}</Link>
                      <p className="mt-1 text-sm text-taupe">{[l.color, l.size && `Size ${l.size}`].filter(Boolean).join(" · ")}</p>
                      <p className="mt-1 text-xs text-stone">SKU {l.sku}</p>
                    </div>
                    <div className="text-right">
                      <p className="tabular-nums">{formatMoney(l.unit_price * l.quantity, c)}</p>
                      {l.compare_at_price && <p className="text-xs text-stone line-through tabular-nums">{formatMoney(l.compare_at_price * l.quantity, c)}</p>}
                    </div>
                  </div>
                  {l.issue && (
                    <p className="mt-2 text-sm text-sale">
                      {l.issue === "insufficient_stock" ? `Only ${l.available} left. Lower the quantity to continue.` : l.issue === "out_of_stock" ? "Sold out. Remove it to continue." : "No longer available. Remove it to continue."}
                    </p>
                  )}
                  <div className="mt-auto flex items-center justify-between pt-4">
                    <div className="flex items-center border border-line" role="group" aria-label={`Quantity of ${l.title}`}>
                      <button type="button" className="grid size-9 place-items-center disabled:opacity-30" aria-label="Decrease quantity" disabled={busy === l.variant_id || l.quantity <= 1} onClick={() => change(l.variant_id, l.quantity - 1)}>
                        <MinusIcon size={14} />
                      </button>
                      <span className="w-8 text-center text-sm tabular-nums">{l.quantity}</span>
                      <button type="button" className="grid size-9 place-items-center disabled:opacity-30" aria-label="Increase quantity" disabled={busy === l.variant_id || l.quantity >= Math.min(l.available, 20)} onClick={() => change(l.variant_id, l.quantity + 1)}>
                        <PlusIcon size={14} />
                      </button>
                    </div>
                    <button type="button" onClick={() => change(l.variant_id, 0)} disabled={busy === l.variant_id} className="text-xs underline underline-offset-4">
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <Link href="/shop" className="mt-6 inline-block text-sm underline underline-offset-4">Continue shopping</Link>
        </div>

        <aside className="h-fit bg-paper p-6 lg:sticky lg:top-36" aria-label="Order summary">
          <h2 className="font-serif text-2xl">Summary</h2>
          {threshold > 0 && (
            <div className="mt-5">
              <p className="text-sm">
                {freeLeft > 0 ? <>You&apos;re {formatMoney(freeLeft, c)} away from free delivery.</> : <span className="text-ok">You&apos;ve unlocked free delivery.</span>}
              </p>
              <div className="mt-2 h-1 bg-line" aria-hidden>
                <div className="h-1 bg-ink transition-all" style={{ width: `${Math.min(100, ((threshold - freeLeft) / threshold) * 100)}%` }} />
              </div>
            </div>
          )}
          <form
            className="mt-6 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              coupon(code);
            }}
          >
            <label htmlFor="cart-coupon" className="sr-only">Discount code</label>
            <Input id="cart-coupon" placeholder="Discount code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="h-10" />
            <Button type="submit" variant="secondary" className="h-10!" busy={busy === "coupon"} disabled={!code}>Apply</Button>
          </form>
          {quote.coupon && (
            <p className={cx("mt-2 text-xs", quote.coupon.valid ? "text-ok" : "text-sale")}>
              {quote.coupon.code}: {quote.coupon.message}{" "}
              {quote.coupon.pending_email_check && "We'll confirm it applies to you at checkout. "}
              <button type="button" className="underline" onClick={() => coupon("")}>Remove</button>
            </p>
          )}
          <dl className="mt-6 grid gap-2 border-t border-line pt-5 text-sm">
            <div className="flex justify-between"><dt className="text-taupe">Subtotal</dt><dd className="tabular-nums">{formatMoney(quote.subtotal, c)}</dd></div>
            {quote.discount_total > 0 && (
              <div className="flex justify-between text-ok"><dt>Discount</dt><dd className="tabular-nums">−{formatMoney(quote.discount_total, c)}</dd></div>
            )}
            <div className="flex justify-between"><dt className="text-taupe">Delivery</dt><dd className="text-taupe">{quote.coupon?.free_shipping && quote.coupon.valid ? "Free" : "Calculated at checkout"}</dd></div>
            <div className="mt-2 flex items-baseline justify-between border-t border-line pt-4">
              <dt className="font-medium">Estimated total</dt>
              <dd className="font-serif text-2xl tabular-nums">{formatMoney(quote.grand_total, c)}</dd>
            </div>
            {quote.tax_mode === "inclusive" && quote.tax_total > 0 && (
              <p className="text-right text-xs text-stone">Includes {formatMoney(quote.tax_total, c)} {quote.tax_label}</p>
            )}
          </dl>
          <ButtonLink href="/checkout" size="lg" className={cx("mt-6 w-full", !quote.can_checkout && "pointer-events-none opacity-50")} aria-disabled={!quote.can_checkout}>
            <LockIcon size={16} /> Checkout
          </ButtonLink>
          <ul className="mt-6 grid gap-2 text-xs text-taupe">
            <li className="flex items-center gap-2"><ShieldIcon size={15} /> Secure payments by Razorpay: UPI, cards, net banking, wallets</li>
            <li className="flex items-center gap-2"><TruckIcon size={15} /> Tracked delivery across India</li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
