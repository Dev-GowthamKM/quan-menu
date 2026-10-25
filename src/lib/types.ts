// Shapes of the JSON our database functions return, and other shared domain types.
// Table rows come from database.types.ts (generated with `npm run db:types`).
import type { Database } from "./database.types";

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];

export type AppRole = Enums<"app_role">;
export type OrderStatus = Enums<"order_status">;
export type PaymentStatus = Enums<"order_payment_status">;
export type FulfillmentStatus = Enums<"fulfillment_status">;

export type StoreSettings = Tables<"store_settings">;

export interface HeroSlide {
  image_url: string;
  /** A short film (MP4 or WebM) played over the picture, muted and looping, where it suits the shopper's connection. */
  video_url?: string;
  image_alt?: string;
  eyebrow?: string;
  heading: string;
  subheading?: string;
  cta_label?: string;
  cta_href?: string;
  secondary_label?: string;
  secondary_href?: string;
  sample?: boolean;
}

export interface Promo {
  image_url: string;
  image_alt?: string;
  eyebrow?: string;
  heading: string;
  cta_label?: string;
  cta_href?: string;
  sample?: boolean;
}

export interface Homepage {
  /** One message, or several separated by | that take turns. */
  announcement?: string;
  hero?: HeroSlide[];
  promos?: Promo[];
  /** The store's own order of home page sections (lib/designs.ts); without it, the design's. */
  sections?: { key: string; on: boolean }[];
}

export interface Policies {
  shipping?: string;
  returns?: string;
  privacy?: string;
  terms?: string;
  about?: string;
}

/** Default parcel for courier bookings (Settings › Shipping › Courier connection). */
export interface PackageDefaults {
  length_cm: number;
  breadth_cm: number;
  height_cm: number;
  item_weight_grams: number;
}

/** A tracking scan kept on a shipment, newest first. */
export interface CourierScan {
  status: string;
  location: string;
  at: string;
}

export interface ContactInfo {
  email?: string;
  phone?: string;
  whatsapp?: string;
  /** Show a "Chat with us" button on the store that opens WhatsApp with this number. */
  chat_button?: boolean;
  address?: string;
  hours?: string;
}

export type SocialLinks = Partial<Record<"instagram" | "facebook" | "x" | "pinterest" | "youtube", string>>;

export interface FaqItem {
  q: string;
  a: string;
}

export interface Swatch {
  name: string;
  hex: string | null;
}

export interface ProductCard {
  id: string;
  slug: string;
  title: string;
  brand_name: string | null;
  brand_slug: string | null;
  price: number;
  max_price: number;
  compare_at_price: number | null;
  on_sale: boolean;
  available_stock: number;
  image_url: string | null;
  image_alt: string | null;
  hover_image_url: string | null;
  swatches: Swatch[];
  rating_avg: number | null;
  rating_count: number;
  published_at: string;
}

export interface Facets {
  brands: { slug: string; name: string; count: number }[];
  sizes: { value: string; count: number }[];
  colors: { value: string; hex: string | null; count: number }[];
  price: { min: number | null; max: number | null };
  on_sale: number;
  in_stock: number;
  total: number;
}

export interface PageVariant {
  id: string;
  sku: string;
  size: string;
  color: string;
  color_hex: string | null;
  price: number;
  compare_at_price: number | null;
  available: number;
}

export interface PageImage {
  id: string;
  url: string;
  alt: string;
  color: string | null;
  width: number | null;
  height: number | null;
}

export interface SizeGuide {
  name: string;
  unit: string;
  columns: string[];
  rows: string[][];
  how_to_measure: string;
  description: string;
}

export interface ProductPage {
  id: string;
  slug: string;
  title: string;
  description: string;
  fabric: string;
  fit: string;
  care: string;
  tags: string[];
  status: Enums<"product_status">;
  published_at: string | null;
  price: number;
  compare_at_price: number | null;
  min_price: number;
  max_price: number;
  min_price_compare_at: number | null;
  on_sale: boolean;
  available_stock: number;
  is_returnable: boolean;
  return_window_days: number | null;
  rating_avg: number | null;
  rating_count: number;
  seo_title: string;
  seo_description: string;
  updated_at: string;
  /** Show the photos as a 360° view (after the motion database update). */
  spin?: boolean;
  brand: { name: string; slug: string; logo_url: string | null } | null;
  category: { name: string; slug: string } | null;
  breadcrumbs: { name: string; slug: string }[];
  images: PageImage[];
  variants: PageVariant[];
  size_guide: SizeGuide | null;
}

export interface CartLine {
  variant_id: string;
  product_id: string;
  slug: string;
  title: string;
  brand: string;
  size: string;
  color: string;
  sku: string;
  image_url: string | null;
  unit_price: number;
  compare_at_price: number | null;
  quantity: number;
  available: number;
  line_subtotal: number;
  discount: number;
  tax_rate_bps: number;
  tax: number;
  line_total: number;
  issue: null | "unavailable" | "out_of_stock" | "insufficient_stock";
}

export interface ShippingRate {
  id: string;
  name: string;
  description: string;
  price: number;
  base_price: number;
  free_over: number | null;
  min_days: number;
  max_days: number;
  cod: boolean;
}

export interface CartQuote {
  cart_id: string | null;
  currency: string;
  lines: CartLine[];
  item_count: number;
  line_count: number;
  subtotal: number;
  discount_total: number;
  shipping_total: number | null;
  cod_fee: number;
  tax_total: number;
  tax_mode?: "inclusive" | "exclusive" | "none";
  tax_label?: string;
  grand_total: number;
  coupon?: {
    code: string;
    valid: boolean;
    message: string;
    kind: Enums<"discount_kind"> | null;
    free_shipping: boolean;
    amount: number;
    pending_email_check: boolean;
  } | null;
  shipping?: {
    serviceable: boolean | null;
    zone: string | null;
    rates: ShippingRate[];
    selected_rate_id: string | null;
  };
  free_shipping_remaining?: number | null;
  free_shipping_threshold?: number | null;
  payment_methods?: {
    razorpay: boolean;
    stripe: boolean;
    cod: boolean;
    cod_reason: string | null;
    cod_fee: number;
  };
  issues: { variant_id?: string; sku?: string; issue: string; message: string; available?: number }[];
  can_checkout: boolean;
}

export interface OrderBrief {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  fulfillment_status: FulfillmentStatus;
  payment_method: "razorpay" | "stripe" | "cod" | "none";
  grand_total: number;
  currency: string;
  email: string;
  phone: string;
  customer_name: string;
  expires_at: string | null;
  user_id: string | null;
  reused?: boolean;
}

export interface Address {
  full_name: string;
  phone: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

export type OrderRow = Omit<Tables<"orders">, "idempotency_key" | "cart_id" | "needs_attention" | "attention_reason"> & {
  shipping_address: Address;
  billing_address: Address | null;
  shipping_method: { name?: string; min_days?: number; max_days?: number; price?: number };
};

export interface OrderDetail {
  order: OrderRow;
  items: Tables<"order_items">[];
  shipments: Tables<"shipments">[];
  refunds: { id: string; amount: number; status: Enums<"refund_state">; created_at: string; processed_at: string | null }[];
  events: { kind: string; message: string; created_at: string }[];
  returns: {
    id: string;
    kind: Enums<"return_kind">;
    status: Enums<"return_state">;
    reason: string;
    created_at: string;
    refund_amount: number | null;
    items: { order_item_id: string; quantity: number }[];
  }[];
}

export interface PostcodeCheck {
  valid: boolean;
  serviceable: boolean;
  message?: string;
  zone?: string;
  cod_available?: boolean;
  rates?: ShippingRate[];
}
