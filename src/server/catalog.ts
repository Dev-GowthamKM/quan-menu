"use server";
import { unstable_cache } from "next/cache";
import { getRelatedProducts, productCardsByIds, searchProducts } from "@/lib/catalog";
import { deliveryWindow, formatDay } from "@/lib/format";
import { rateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { serviceability, shiprocketConfigured } from "@/lib/shipping/shiprocket";
import { supabasePublic } from "@/lib/supabase/public";
import type { PostcodeCheck, ProductCard } from "@/lib/types";

const clean = (ids: unknown) =>
  (Array.isArray(ids) ? ids : []).filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)).slice(0, 24);

export async function getProductCards(ids: string[]): Promise<ProductCard[]> {
  return productCardsByIds(clean(ids));
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
  const { data, error } = await supabasePublic().rpc("check_postcode", { p_postal_code: code });
  if (error) return { ok: false, message: "We couldn't check that PIN code right now." };
  const res = data as unknown as PostcodeCheck;
  if (!res.serviceable) return { ok: false, message: res.message || "Sorry, we don't deliver to this PIN code yet." };
  const settings = await getSettings();
  const days = settings.shiprocket_enabled && settings.shiprocket_pickup_postcode && shiprocketConfigured()
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
