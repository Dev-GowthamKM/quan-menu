import { unstable_cache } from "next/cache";
import { SUPABASE_CONFIGURED } from "./env";
import { contextStoreId } from "./store";
import { supabasePublic } from "./supabase/public";
import type { ContactInfo, FaqItem, Homepage, PackageDefaults, Policies, SocialLinks, StoreSettings } from "./types";

export const DEFAULT_SETTINGS: StoreSettings = {
  id: 1,
  store_id: "",
  store_name: "Taana",
  tagline: "Considered clothing, made to last.",
  logo_url: null,
  primary_color: "#1f1416",
  brand_color: "#6b1d2e",
  accent_color: "#b07d2b",
  background_color: "#fbf6ee",
  heading_font: "cormorant",
  heading_italic: true,
  body_font: "jost",
  design: "atelier",
  design_options: {},
  currency: "INR",
  timezone: "Asia/Kolkata",
  tax_mode: "inclusive",
  tax_label: "GST",
  tax_slabs: [],
  gstin: "",
  free_shipping_threshold: null,
  low_stock_threshold: 5,
  reservation_minutes: 30,
  razorpay_enabled: true,
  stripe_enabled: false,
  cod_enabled: true,
  cod_fee: 0,
  cod_min_order: 0,
  cod_max_order: 2500000,
  cod_confirmation: false,
  cod_confirm_hours: 24,
  cod_max_open_orders: 3,
  cod_max_returned: 2,
  stock_alerts_enabled: true,
  cart_reminders_enabled: false,
  cart_reminder_hours: 3,
  price_alerts_enabled: true,
  return_window_days: 15,
  return_shipping: "free",
  return_shipping_fee: 0,
  policies: {},
  faq: [],
  contact: {},
  social: {},
  homepage: {},
  email_templates: {},
  seo_title: "",
  seo_description: "",
  og_image_url: null,
  reviews_enabled: true,
  reviews_require_purchase: true,
  reviews_auto_publish: false,
  maintenance_mode: false,
  maintenance_message: "",
  shiprocket_enabled: false,
  shiprocket_pickup_location: "Primary",
  shiprocket_pickup_postcode: "",
  shiprocket_courier_choice: "recommended",
  package_defaults: { length_cm: 30, breadth_cm: 25, height_cm: 5, item_weight_grams: 400 },
  whatsapp_enabled: false,
  whatsapp_templates: {},
  phone_login_enabled: false,
  phone_login_channel: "sms",
  whatsapp_login_template: "",
  whatsapp_login_language: "en",
  updated_at: new Date(0).toISOString(),
  updated_by: null,
};

export interface Settings extends StoreSettings {
  /** True when the database could not be read (not configured or not migrated). */
  unavailable?: boolean;
}

/** A store's settings, cached for every visitor and refreshed when an admin saves them. */
const loadSettings = unstable_cache(
  async (storeId: string | null): Promise<Settings> => {
    if (!SUPABASE_CONFIGURED) return { ...DEFAULT_SETTINGS, unavailable: true };
    // Without a store id (before the multi-store database update) there is one row, id 1.
    const query = supabasePublic(storeId).from("store_settings").select("*");
    const { data, error } = await (storeId ? query.eq("store_id", storeId) : query.eq("id", 1)).maybeSingle();
    if (error || !data) {
      console.error("[settings] could not load store settings:", error?.message);
      return { ...DEFAULT_SETTINGS, unavailable: true };
    }
    return data;
  },
  ["store-settings"],
  { tags: ["settings"], revalidate: 300 },
);

/** The settings of the given store, or of the store this request is for. */
export async function getSettings(storeId?: string | null): Promise<Settings> {
  return loadSettings(storeId === undefined ? await contextStoreId() : storeId);
}

export const homepageOf = (s: StoreSettings) => (s.homepage ?? {}) as Homepage;
export const policiesOf = (s: StoreSettings) => (s.policies ?? {}) as Policies;
export const contactOf = (s: StoreSettings) => (s.contact ?? {}) as ContactInfo;
export const socialOf = (s: StoreSettings) => (s.social ?? {}) as SocialLinks;
export const faqOf = (s: StoreSettings) => (Array.isArray(s.faq) ? s.faq : []) as unknown as FaqItem[];

export function packageDefaultsOf(s: StoreSettings): PackageDefaults {
  const p = (s.package_defaults ?? {}) as Partial<PackageDefaults>;
  const n = (v: unknown, fallback: number) => (typeof v === "number" && v > 0 ? v : fallback);
  return { length_cm: n(p.length_cm, 30), breadth_cm: n(p.breadth_cm, 25), height_cm: n(p.height_cm, 5), item_weight_grams: n(p.item_weight_grams, 400) };
}
