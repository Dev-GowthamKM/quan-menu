"use server";
import { unstable_cache } from "next/cache";
import { getProductPage, getRelatedProducts, productCardsByIds, searchProducts } from "@/lib/catalog";
import { deliveryWindow, formatDay } from "@/lib/format";
import { rateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { serviceability, shiprocketConfigured } from "@/lib/shipping/shiprocket";
import { contextStore } from "@/lib/store";
import { supabasePublic } from "@/lib/supabase/public";
import type { PageVariant, PostcodeCheck, ProductCard, ProductPage } from "@/lib/types";

const clean = (ids: unknown) =>
  (Array.isArray(ids) ? ids : []).filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)).slice(0, 24);

export async function getProductCards(ids: string[]): Promise<ProductCard[]> {
  return productCardsByIds(clean(ids));
}

/** What Quick add needs to put a product in the bag from a list: its options, prices and stock. */
export interface QuickProduct {
  slug: string;
  title: string;
  image: string | null;
  min_price: number;
  max_price: number;
  min_price_compare_at: number | null;
  option_names: ProductPage["option_names"];
  variants: PageVariant[];
}

/** A product on sale in this store, for Quick add (null if there's no such product on sale). */
export async function quickProduct(slug: string): Promise<QuickProduct | null> {
  if (typeof slug !== "string" || !/^[a-z0-9-]{1,120}$/.test(slug)) return null;
  const p = await getProductPage(slug);
  if (!p) return null;
  return {
    slug: p.slug,
    title: p.title,
    image: p.images[0]?.url ?? null,
    min_price: p.min_price,
    max_price: p.max_price,
    min_price_compare_at: p.min_price_compare_at,
    option_names: p.option_names,
    variants: p.variants,
  };
}

/** "Recommended for you": products related to what this visitor looked at recently. */
export async function getRecommendations(viewedIds: string[]): Promise<ProductCard[]> {
  const viewed = clean(viewedIds);
  const seen = new Set(viewed);
  const picks: ProductCard[] = [];
  for (const id of viewed.slice(0, 3)) {
    for (const p of await getRelatedProducts(id, 8)) {
      if (!seen.has(p.id) && p.available_stock > 0) {
        seen.add(p.id);
        picks.push(p);
      }
    }
  }
  if (picks.length < 4) {
    const { items } = await searchProducts({ sort: "featured", limit: 12, inStock: true });
    for (const p of items) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        picks.push(p);
      }
    }
  }
  return picks.slice(0, 12);
}

export interface DeliveryCheck {
  ok: boolean;
  message: string;
  cod?: boolean;
  options?: { name: string; price: number; from: string; to: string }[];
  /** The courier's own delivery estimate ("Sat, 24 Oct"), when Shiprocket is connected. */
  courierEta?: string;
}

// Courier delivery estimate for a PIN code, cached for six hours. Never slows the check
// down for long: Shiprocket gets three seconds, and any problem just leaves it out.
const courierDays = unstable_cache(
  async (pickup: string, pin: string): Promise<number | null> => {
    try {
      const { couriers, recommendedId } = await serviceability({ pickup, delivery: pin, weightKg: 0.5, cod: false, timeoutMs: 3000 });
      const pick = couriers.find((c) => c.id === recommendedId) ?? [...couriers].sort((a, b) => (a.days ?? 99) - (b.days ?? 99))[0];
      return pick?.days ?? null;
    } catch {
      return null;
    }
  },
  ["courier-days"],
  { revalidate: 6 * 3600 },
);

/** Product page "check delivery": serviceability, dates and COD for a PIN code. */
export async function checkDelivery(pin: string): Promise<DeliveryCheck> {
  const code = String(pin || "").replace(/\s/g, "");
  if (!/^[1-9][0-9]{5}$/.test(code)) return { ok: false, message: "Enter a valid 6-digit PIN code." };
  if (!(await rateLimit("pincode", 30, 60))) return { ok: false, message: "Too many checks. Please wait a moment." };
  const store = await contextStore();
  const { data, error } = await supabasePublic(store.id).rpc("check_postcode", { p_postal_code: code });
  if (error) return { ok: false, message: "We couldn't check that PIN code right now." };
  const res = data as unknown as PostcodeCheck;
  if (!res.serviceable) return { ok: false, message: res.message || "Sorry, we don't deliver to this PIN code yet." };
  const settings = await getSettings(store.id);
  const days = shiprocketConfigured(store) && settings.shiprocket_enabled && settings.shiprocket_pickup_postcode
    ? await courierDays(settings.shiprocket_pickup_postcode, code)
    : null;
  return {
    ok: true,
    message: `Delivers to ${code}`,
    cod: !!res.cod_available,
    options: (res.rates ?? []).map((r) => {
      const w = deliveryWindow(r.min_days, r.max_days);
      return { name: r.name, price: r.base_price, from: formatDay(w.from), to: formatDay(w.to) };
    }),
    ...(days ? { courierEta: formatDay(deliveryWindow(days, days).to) } : {}),
  };
}
