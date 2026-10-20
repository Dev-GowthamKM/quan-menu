"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toggleWishlist } from "@/server/account";
import { addToCart as addAction, getCart, updateCartItem } from "@/server/cart";
import { formatMoney } from "@/lib/money";
import type { AppRole, CartQuote } from "@/lib/types";
import CatalogImage from "../ui/CatalogImage";
import { buttonClass, cx, Spinner } from "../ui/controls";
import { Dialog } from "../ui/Dialog";
import { MinusIcon, PlusIcon } from "../ui/icons";

interface Session {
  user: { email: string; name: string } | null;
  role: AppRole | null;
  cartCount: number;
  wishlist: string[];
}

interface Toast {
  id: number;
  text: string;
  tone: "ok" | "error";
}

interface StoreContext {
  session: Session | null;
  cart: CartQuote | null;
  cartCount: number;
  openCart: () => void;
  refreshCart: () => Promise<void>;
  addItem: (variantId: string, quantity?: number) => Promise<boolean>;
  setQuantity: (variantId: string, quantity: number) => Promise<boolean>;
  isWished: (productId: string) => boolean;
  toggleWish: (productId: string) => Promise<void>;
  toast: (text: string, tone?: Toast["tone"]) => void;
  currency: string;
}

const Ctx = createContext<StoreContext | null>(null);

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}

export default function StoreProvider({ currency, children }: { currency: string; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [cart, setCart] = useState<CartQuote | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [wished, setWished] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const loadSession = useCallback(async () => {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      if (!res.ok) return;
      const data: Session = await res.json();
      setSession(data);
      setWished(new Set(data.wishlist));
    } catch {
      // Offline or the store isn't configured yet; the page still works read-only.
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession, pathname]);

  const toast = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const refreshCart = useCallback(async () => {
    try {
      setCart(await getCart());
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }, [toast]);

  const openCart = useCallback(() => {
    setCartOpen(true);
    refreshCart();
  }, [refreshCart]);

  const addItem = useCallback(
    async (variantId: string, quantity = 1) => {
      const res = await addAction(variantId, quantity);
      if (!res.ok) {
        toast(res.error, "error");
        return false;
      }
      setCart(res.data);
      setSession((s) => (s ? { ...s, cartCount: res.data.item_count } : s));
      setCartOpen(true);
      return true;
    },
    [toast],
  );

  const setQuantity = useCallback(
    async (variantId: string, quantity: number) => {
      const res = await updateCartItem(variantId, quantity);
      if (!res.ok) {
        toast(res.error, "error");
        return false;
      }
      setCart(res.data);
      setSession((s) => (s ? { ...s, cartCount: res.data.item_count } : s));
      router.refresh();
      return true;
    },
    [router, toast],
  );

  const toggleWish = useCallback(
    async (productId: string) => {
      const res = await toggleWishlist(productId);
      if (!res.ok) {
        if (res.error === "SIGN_IN") {
          router.push(`/login?next=${encodeURIComponent(pathname)}&reason=wishlist`);
          return;
        }
        toast(res.error, "error");
        return;
      }
      setWished((prev) => {
        const next = new Set(prev);
        if (res.data.saved) next.add(productId);
        else next.delete(productId);
        return next;
      });
      toast(res.data.saved ? "Saved to your wishlist" : "Removed from your wishlist");
    },
    [pathname, router, toast],
  );

  const value = useMemo<StoreContext>(
    () => ({
      session,
      cart,
      cartCount: cart?.item_count ?? session?.cartCount ?? 0,
      openCart,
      refreshCart,
      addItem,
      setQuantity,
      isWished: (id) => wished.has(id),
      toggleWish,
      toast,
      currency,
    }),
    [session, cart, openCart, refreshCart, addItem, setQuantity, wished, toggleWish, toast, currency],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} cart={cart} setQuantity={setQuantity} />
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto max-w-md animate-fade-in px-5 py-3 text-sm shadow-lg",
              t.tone === "error" ? "bg-sale text-white" : "bg-ink text-ivory",
            )}
            role={t.tone === "error" ? "alert" : "status"}
          >
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

function CartDrawer({
  open,
  onClose,
  cart,
  setQuantity,
}: {
  open: boolean;
  onClose: () => void;
  cart: CartQuote | null;
  setQuantity: (variantId: string, quantity: number) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const change = async (variantId: string, quantity: number) => {
    setBusy(variantId);
    await setQuantity(variantId, quantity);
    setBusy(null);
  };
  const empty = cart && cart.line_count === 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      side="right"
      title={<span>Your bag{cart && cart.item_count > 0 ? ` (${cart.item_count})` : ""}</span>}
      footer={
        cart && !empty ? (
          <div className="grid gap-3">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-taupe">Subtotal</span>
              <span className="font-medium">{formatMoney(cart.subtotal - cart.discount_total, cart.currency)}</span>
            </div>
            {typeof cart.free_shipping_remaining === "number" && cart.free_shipping_remaining > 0 && (
              <p className="text-xs text-taupe">
                Add {formatMoney(cart.free_shipping_remaining, cart.currency)} more for free delivery.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Link href="/cart" onClick={onClose} className={buttonClass("secondary", "md")}>View bag</Link>
              <Link href="/checkout" onClick={onClose} className={buttonClass("primary", "md")}>Checkout</Link>
            </div>
          </div>
        ) : undefined
      }
    >
      {!cart ? (
        <div className="grid place-items-center py-24"><Spinner /></div>
      ) : empty ? (
        <div className="px-6 py-20 text-center">
          <p className="font-serif text-2xl">Your bag is empty</p>
          <p className="mt-2 text-sm text-taupe">Discover new arrivals and pieces made to last.</p>
          <Link href="/shop" onClick={onClose} className={buttonClass("primary", "md", "mt-6")}>Start shopping</Link>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {cart.lines.map((line) => (
            <li key={line.variant_id} className="flex gap-4 px-5 py-4">
              <Link href={`/products/${line.slug}`} onClick={onClose} tabIndex={-1} aria-hidden="true" className="relative aspect-[4/5] w-20 shrink-0 overflow-hidden bg-bone">
                <CatalogImage src={line.image_url} alt="" fill sizes="80px" className="object-cover" />
              </Link>
              <div className="min-w-0 flex-1 text-sm">
                <p className="label-caps text-stone">{line.brand}</p>
                <Link href={`/products/${line.slug}`} onClick={onClose} className="mt-0.5 block truncate hover:underline">{line.title}</Link>
                <p className="mt-0.5 text-xs text-taupe">{[line.color, line.size && `Size ${line.size}`].filter(Boolean).join(" · ")}</p>
                {line.issue && <p className="mt-1 text-xs text-sale">{line.issue === "insufficient_stock" ? `Only ${line.available} left` : "No longer available"}</p>}
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center border border-line">
                    <button
                      type="button"
                      className="grid size-8 place-items-center disabled:opacity-40"
                      aria-label={`Decrease quantity of ${line.title}`}
                      disabled={busy === line.variant_id}
                      onClick={() => change(line.variant_id, line.quantity - 1)}
                    >
                      <MinusIcon size={14} />
                    </button>
                    <span className="w-7 text-center text-sm tabular-nums" aria-live="polite">{line.quantity}</span>
                    <button
                      type="button"
                      className="grid size-8 place-items-center disabled:opacity-40"
                      aria-label={`Increase quantity of ${line.title}`}
                      disabled={busy === line.variant_id || line.quantity >= line.available}
                      onClick={() => change(line.variant_id, line.quantity + 1)}
                    >
                      <PlusIcon size={14} />
                    </button>
                  </div>
                  <span className="font-medium tabular-nums">{formatMoney(line.unit_price * line.quantity, cart.currency)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
