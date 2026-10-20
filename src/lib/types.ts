import { SUPABASE_URL } from "./config";
import { BANKS } from "./vietqr";

export const LANG_KEYS = ["en", "ko", "zh", "ja"] as const;
export type Lang = (typeof LANG_KEYS)[number];
export type ML = Record<Lang, string>;

export const ALLERGEN_KEYS = ["peanut", "shellfish", "fish", "egg", "dairy", "gluten", "soy", "pork", "beef"] as const;
export type Allergen = (typeof ALLERGEN_KEYS)[number];

/** A photo or short video of a dish, stored in the project's "dish-media" storage bucket. */
export interface Media {
  type: "image" | "video";
  url: string;
}

export const MEDIA_BUCKET = "dish-media";
export const MAX_MEDIA = 6;
/** Only files from this project's own storage are shown, so a crafted save can't embed outside content. */
export const MEDIA_PREFIX = SUPABASE_URL ? `${SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET}/` : "";

/** Shop type: sets sensible defaults for drink options. */
export const SHOP_KINDS = ["food", "cafe", "tea"] as const;
export type ShopKind = (typeof SHOP_KINDS)[number];

export const SIZE_KEYS = ["S", "M", "L"] as const;
export type SizeKey = (typeof SIZE_KEYS)[number];

/** Choices a customer makes for one drink. Prices are the full price of each size. */
export interface DrinkOpts {
  sizes?: { k: SizeKey; price: number }[];
  sugar?: boolean;
  ice?: boolean;
  /** Customers may add the shop's toppings to this drink. */
  tops?: boolean;
}

/** An add-on from the shop-wide topping list (trân châu, thạch…). */
export interface Topping {
  vi: string;
  price: number;
  name?: ML | null;
}

export interface Dish {
  vi: string;
  price: number;
  spice: number;
  alg: Allergen[];
  pron: string;
  name: ML | null;
  desc: ML | null;
  media?: Media[];
  opts?: DrinkOpts | null;
  /** "Must-try" badge on the customer menu. */
  special?: boolean;
}

/** Bank account customers can pay into by VietQR transfer. */
export interface Pay {
  bank: string;
  acct: string;
  name: string;
}

/** Dishes marked sold out, and the Vietnam-time day they were marked. Stale days mean nothing is sold out. */
export interface SoldOut {
  day: string;
  names: string[];
}

/** Today's date in Vietnam (UTC+7, no daylight saving), as YYYY-MM-DD. */
export const vnToday = (now = Date.now()) => new Date(now + 7 * 3600_000).toISOString().slice(0, 10);

export interface Stall {
  name: string;
  area: string;
  slug: string;
  published: boolean;
}

export interface MenuData extends Stall {
  dishes: Dish[];
  kind?: ShopKind;
  toppings?: Topping[];
  /** Database id and last-change time: saves are refused if the menu changed since it was loaded. */
  id?: string;
  updatedAt?: string;
  pay?: Pay | null;
  maps?: string;
  soldOut?: SoldOut;
}

/** One of the stalls an account runs, for the stall switcher. */
export interface StallRef {
  id: string;
  slug: string;
  name: string;
  published: boolean;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function media(v: unknown): Media[] {
  if (!MEDIA_PREFIX || !Array.isArray(v)) return [];
  const out: Media[] = [];
  for (const m of v) {
    if (!m || typeof m !== "object") continue;
    const { type, url } = m as Record<string, unknown>;
    if ((type === "image" || type === "video") && typeof url === "string" && url.startsWith(MEDIA_PREFIX) && !url.includes("..")) {
      out.push({ type, url });
    }
  }
  return out.slice(0, MAX_MEDIA);
}

function ml(v: unknown): ML | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const out = { en: str(o.en), ko: str(o.ko), zh: str(o.zh), ja: str(o.ja) };
  return out.en ? out : null;
}

const price = (v: unknown) => Math.max(0, Math.min(100_000_000, Math.round(Number(v) || 0)));

function opts(v: unknown): DrinkOpts | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const seen = new Set<SizeKey>();
  const sizes = (Array.isArray(o.sizes) ? o.sizes : [])
    .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}))
    .filter((x): x is { k: SizeKey; price: unknown } => SIZE_KEYS.includes(x.k as SizeKey) && !seen.has(x.k as SizeKey) && !!seen.add(x.k as SizeKey))
    .map((x) => ({ k: x.k, price: price(x.price) }))
    .sort((a, b) => SIZE_KEYS.indexOf(a.k) - SIZE_KEYS.indexOf(b.k));
  const out: DrinkOpts = { sizes: sizes.length >= 2 ? sizes : undefined, sugar: o.sugar === true, ice: o.ice === true, tops: o.tops === true };
  return out.sizes || out.sugar || out.ice || out.tops ? out : null;
}

export function cleanKind(v: unknown): ShopKind {
  return SHOP_KINDS.includes(v as ShopKind) ? (v as ShopKind) : "food";
}

export function cleanToppings(v: unknown): Topping[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((t) => (t && typeof t === "object" ? (t as Record<string, unknown>) : {}))
    .map((t) => ({ vi: str(t.vi).slice(0, 60), price: price(t.price), name: ml(t.name) }))
    .filter((t) => t.vi)
    .slice(0, 20);
}

/** Turns untrusted input (AI output, request bodies, DB rows) into a valid Dish. */
export function cleanDish(d: unknown): Dish | null {
  if (!d || typeof d !== "object") return null;
  const o = d as Record<string, unknown>;
  const vi = str(o.vi).slice(0, 200);
  if (!vi) return null;
  const algIn = Array.isArray(o.alg) ? o.alg : Array.isArray(o.allergens) ? o.allergens : [];
  return {
    vi,
    price: price(o.price),
    spice: Math.max(0, Math.min(3, Math.round(Number(o.spice) || 0))),
    alg: [...new Set(algIn.filter((a): a is Allergen => ALLERGEN_KEYS.includes(a as Allergen)))],
    pron: str(o.pron).slice(0, 120),
    name: ml(o.name),
    desc: ml(o.desc ?? o.descr),
    media: media(o.media),
    opts: opts(o.opts),
    special: o.special === true,
  };
}

/** Strips tone marks and upper-cases, the way banks print account holder names. */
const plainUpper = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "D").toUpperCase();

export function cleanPay(v: unknown): Pay | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const bank = str(o.bank);
  const acct = str(o.acct).replace(/[\s.-]/g, "").toUpperCase();
  if (!BANKS.some((b) => b.bin === bank) || !/^[0-9A-Z]{4,19}$/.test(acct)) return null;
  const name = plainUpper(str(o.name)).replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 50);
  return { bank, acct, name };
}

/** Google Maps share links only, so the review button can't send customers anywhere else. */
export function cleanMaps(v: unknown): string {
  let s = str(v);
  if (!s) return "";
  if (/^http:\/\//i.test(s)) s = "https://" + s.slice(7);
  else if (!/^https:\/\//i.test(s)) s = "https://" + s;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return "";
  }
  const h = u.hostname.toLowerCase();
  const path = u.pathname;
  const ok =
    u.protocol === "https:" &&
    !u.username && !u.password && !u.port &&
    (h === "maps.app.goo.gl" ||
      h === "g.page" ||
      h === "share.google" ||
      h === "maps.google.com" ||
      (h === "goo.gl" && path.startsWith("/maps")) ||
      (h === "g.co" && path.startsWith("/kgs/")) ||
      (h === "search.google.com" && path.startsWith("/local/")) ||
      (/^(www\.)?google\.(com|com\.vn|co\.[a-z]{2}|[a-z]{2})$/.test(h) && path.startsWith("/maps")));
  return ok && u.href.length <= 500 ? u.href : "";
}

export function cleanSoldOut(v: unknown): SoldOut {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const day = typeof o.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.day) ? o.day : "";
  const names = Array.isArray(o.names) ? o.names.filter((n): n is string => typeof n === "string").slice(0, 300) : [];
  return { day, names: day ? names : [] };
}

/** Names sold out today; yesterday's list no longer counts. */
export const soldToday = (s: SoldOut | undefined, today = vnToday()) => (s && s.day === today ? s.names : []);

export const isTranslated = (d: Dish) => !!d.name?.en;
