"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { deleteProducts, duplicateProduct, saveProduct, skuConflicts, type ProductInput } from "@/server/admin/catalog";
import { formatDateTime } from "@/lib/format";
import { discountPercent, fromMinor, toMinor } from "@/lib/money";
import { optionNames, storeKind } from "@/lib/store-types";
import { Badge, Button, cx } from "../../ui/controls";
import { ExternalIcon } from "../../ui/icons";
import ChipsInput from "../ChipsInput";
import ImageManager, { type EditorImage } from "../ImageManager";
import { useToast } from "../Toaster";
import { adminInput, Card } from "../ui";
import { SPIN_MIN } from "../../store/product/SpinViewer";
import VariantsEditor, { makeSku, newVariant, type ColorOption, type VariantRow } from "./VariantsEditor";

export interface EditorProduct {
  id: string | null;
  title: string;
  slug: string;
  description: string;
  fabric: string;
  fit: string;
  care: string;
  brand_id: string | null;
  category_id: string | null;
  size_guide_id: string | null;
  tags: string[];
  status: "draft" | "active" | "archived";
  published_at: string | null;
  is_featured: boolean;
  price: number | null;
  compare_at_price: number | null;
  tax_rate_bps: number | null;
  weight_grams: number | null;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  is_returnable: boolean;
  return_window_days: number | null;
  seo_title: string;
  seo_description: string;
  /** The 360° view; null before the motion database update, which adds it. */
  spin?: boolean | null;
  /** Its own names for its two options; null before the store types update, which adds them. */
  option_names?: { size?: string; color?: string } | null;
  is_sample?: boolean;
  created_at?: string;
  updated_at?: string;
  variants: {
    id: string; sku: string; size: string; color: string; color_hex: string | null; price: number | null; compare_at_price: number | null;
    stock_quantity: number; reserved_quantity: number; low_stock_threshold: number | null; barcode: string | null; weight_grams: number | null; is_active: boolean;
  }[];
  images: { id: string; url: string; storage_path: string | null; alt: string; color: string | null; width: number | null; height: number | null }[];
  collection_ids: string[];
}

type Opt = { id: string; label: string };
export interface EditorOptions {
  brands: Opt[];
  categories: (Opt & { size_guide_id: string | null })[];
  sizeGuides: Opt[];
  collections: Opt[];
  tagSuggestions: string[];
}
export interface EditorSettings {
  storeName: string;
  siteUrl: string;
  taxLabel: string;
  taxMode: string;
  returnWindowDays: number;
  lowStockThreshold: number;
  /** What the store sells (lib/store-types.ts): the editor's words, suggested sizes and option names. */
  storeType?: string;
}

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);

/** "Washed Linen Shirt" -> "WLS-482": initials plus a number that stays put while typing. */
function defaultPrefix(title: string, number = Math.floor(100 + Math.random() * 900)) {
  const letters = title.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  return `${letters || "SKU"}-${number}`;
}

/** ISO timestamp -> value for <input type="datetime-local"> in the browser's time zone. */
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const cm = (mm: number | null) => (mm === null || mm === undefined ? "" : String(mm / 10));
const mm = (cmText: string) => {
  const t = cmText.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) : NaN;
};
const intOrNull = (t: string) => {
  const s = t.trim();
  if (!s) return null;
  return /^\d+$/.test(s) ? Number(s) : NaN;
};

interface State {
  title: string;
  slug: string;
  slugTouched: boolean;
  description: string;
  fabric: string;
  fit: string;
  care: string;
  brand_id: string;
  category_id: string;
  size_guide_id: string;
  tags: string[];
  status: EditorProduct["status"];
  schedule: boolean;
  publishAt: string;
  is_featured: boolean;
  price: string;
  compare_at: string;
  taxMode: "default" | "fixed";
  taxPercent: string;
  weight: string;
  length: string;
  width: string;
  height: string;
  is_returnable: boolean;
  returnDays: string;
  seo_title: string;
  seo_description: string;
  images: EditorImage[];
  spin: boolean;
  /** The product's own names for its options; empty for the store's. */
  optionSize: string;
  optionColor: string;
  sizes: string[];
  colors: ColorOption[];
  skuPrefix: string;
  prefixTouched: boolean;
  variants: VariantRow[];
  collection_ids: string[];
}

function initialState(p: EditorProduct): State {
  const sizes: string[] = [];
  const colors: ColorOption[] = [];
  for (const v of p.variants) {
    if (v.size && !sizes.includes(v.size)) sizes.push(v.size);
    if (v.color && !colors.some((c) => c.name === v.color)) colors.push({ name: v.color, hex: v.color_hex });
  }
  const future = !!p.published_at && new Date(p.published_at) > new Date();
  const prefix = p.variants[0]?.sku ? p.variants[0].sku.split("-").slice(0, 2).join("-") : defaultPrefix(p.title);
  return {
    title: p.title,
    slug: p.slug,
    slugTouched: !!p.id,
    description: p.description,
    fabric: p.fabric,
    fit: p.fit,
    care: p.care,
    brand_id: p.brand_id ?? "",
    category_id: p.category_id ?? "",
    size_guide_id: p.size_guide_id ?? "",
    tags: p.tags,
    status: p.status,
    schedule: future,
    publishAt: future ? toLocalInput(p.published_at) : "",
    is_featured: p.is_featured,
    price: fromMinor(p.price),
    compare_at: fromMinor(p.compare_at_price),
    taxMode: p.tax_rate_bps === null ? "default" : "fixed",
    taxPercent: p.tax_rate_bps === null ? "" : String(p.tax_rate_bps / 100),
    weight: p.weight_grams === null ? "" : String(p.weight_grams),
    length: cm(p.length_mm),
    width: cm(p.width_mm),
    height: cm(p.height_mm),
    is_returnable: p.is_returnable,
    returnDays: p.return_window_days === null ? "" : String(p.return_window_days),
    seo_title: p.seo_title,
    seo_description: p.seo_description,
    images: p.images.map((i) => ({ ...i, key: i.id })),
    spin: !!p.spin,
    optionSize: p.option_names?.size ?? "",
    optionColor: p.option_names?.color ?? "",
    sizes,
    colors,
    skuPrefix: prefix,
    prefixTouched: !!p.id,
    variants: p.variants.length
      ? p.variants.map((v) => ({
          key: v.id, id: v.id, sku: v.sku, size: v.size, color: v.color, color_hex: v.color_hex,
          price: fromMinor(v.price), compare_at: fromMinor(v.compare_at_price), stock: String(v.stock_quantity), stock_loaded: v.stock_quantity,
          reserved: v.reserved_quantity, low_stock_threshold: v.low_stock_threshold === null ? "" : String(v.low_stock_threshold),
          barcode: v.barcode ?? "", weight_grams: v.weight_grams === null ? "" : String(v.weight_grams), is_active: v.is_active,
        }))
      : [newVariant({ sku: makeSku(prefix, "", "", new Set()) })],
    collection_ids: p.collection_ids,
  };
}

/** Turns the form into the payload saveProduct expects, or an error to show. */
function toPayload(s: State, id: string | null, wasPublishedAt: string | null, canSpin: boolean, canName: boolean): { payload?: ProductInput; error?: string } {
  if (!s.title.trim()) return { error: "Enter a product title." };
  const price = toMinor(s.price);
  if (price === null) return { error: "Enter a price, such as 2499 or 2499.50." };
  const compare = s.compare_at.trim() ? toMinor(s.compare_at) : null;
  if (s.compare_at.trim() && compare === null) return { error: "The compare-at price isn't a valid amount." };
  if (compare !== null && compare <= price) return { error: "The compare-at price must be higher than the price (it shows as the original price)." };
  let tax: number | null = null;
  if (s.taxMode === "fixed") {
    const pct = Number(s.taxPercent);
    if (!s.taxPercent.trim() || !Number.isFinite(pct) || pct < 0 || pct > 50) return { error: "Enter a tax rate between 0 and 50%." };
    tax = Math.round(pct * 100);
  }
  const dims = { weight_grams: intOrNull(s.weight), length_mm: mm(s.length), width_mm: mm(s.width), height_mm: mm(s.height) };
  if (Object.values(dims).some((v) => Number.isNaN(v))) return { error: "Weight and dimensions must be numbers." };
  const returnDays = intOrNull(s.returnDays);
  if (Number.isNaN(returnDays)) return { error: "The return window must be a whole number of days." };
  // Publish date: a scheduled time, "now" (null lets the database stamp it) when a
  // scheduled product is published early, otherwise left as it is so editing a live
  // product doesn't make it look new.
  let publishedAt: string | null | undefined = undefined;
  if (s.status === "active" && s.schedule) {
    if (!s.publishAt) return { error: "Choose the date and time to publish." };
    const d = new Date(s.publishAt);
    if (Number.isNaN(d.getTime())) return { error: "The publish date isn't valid." };
    publishedAt = d.toISOString();
  } else if (s.status === "active" && wasPublishedAt && new Date(wasPublishedAt) > new Date()) {
    publishedAt = null;
  }
  const seen = new Set<string>();
  const variants = [];
  for (const v of s.variants) {
    const sku = v.sku.trim().toUpperCase();
    const name = [v.color, v.size].filter(Boolean).join(" / ") || "the default variant";
    if (!sku) return { error: `Enter a SKU for ${name}.` };
    if (!/^[A-Z0-9][A-Z0-9._/-]{0,63}$/.test(sku)) return { error: `SKU ${sku} can only use letters, numbers, dots, dashes, slashes and underscores.` };
    if (seen.has(sku)) return { error: `SKU ${sku} is used twice.` };
    seen.add(sku);
    if (!/^\d+$/.test(v.stock.trim())) return { error: `Stock for ${name} must be a whole number.` };
    const vp = v.price.trim() ? toMinor(v.price) : null;
    const vc = v.compare_at.trim() ? toMinor(v.compare_at) : null;
    if (v.price.trim() && vp === null) return { error: `The price for ${name} isn't a valid amount.` };
    if (v.compare_at.trim() && vc === null) return { error: `The compare-at price for ${name} isn't a valid amount.` };
    if (vc !== null && vc <= (vp ?? price)) return { error: `The compare-at price for ${name} must be higher than its price.` };
    const low = intOrNull(v.low_stock_threshold);
    const weight = intOrNull(v.weight_grams);
    if (Number.isNaN(low) || Number.isNaN(weight)) return { error: `Low-stock alert and weight for ${name} must be whole numbers.` };
    variants.push({
      id: v.id, sku, size: v.size.trim(), color: v.color.trim(), color_hex: v.color ? v.color_hex : null, price: vp, compare_at_price: vc,
      stock_quantity: Number(v.stock), stock_loaded: v.stock_loaded, low_stock_threshold: low, barcode: v.barcode.trim() || null,
      weight_grams: weight, is_active: v.is_active,
    });
  }
  return {
    payload: {
      id,
      title: s.title.trim(),
      slug: s.slug.trim() || slugify(s.title),
      brand_id: s.brand_id || null,
      category_id: s.category_id || null,
      size_guide_id: s.size_guide_id || null,
      description: s.description,
      fabric: s.fabric,
      fit: s.fit,
      care: s.care,
      tags: s.tags,
      status: s.status,
      ...(publishedAt !== undefined ? { published_at: publishedAt } : {}),
      is_featured: s.is_featured,
      price,
      compare_at_price: compare,
      tax_rate_bps: tax,
      ...dims,
      is_returnable: s.is_returnable,
      return_window_days: returnDays,
      seo_title: s.seo_title,
      seo_description: s.seo_description,
      variants,
      images: s.images.map((i) => ({ id: i.id ?? null, url: i.url, storage_path: i.storage_path ?? null, alt: i.alt, color: i.color ?? null, width: i.width ?? null, height: i.height ?? null })),
      ...(canSpin ? { spin: s.spin } : {}),
      ...(canName ? { option_names: { size: s.optionSize.trim(), color: s.optionColor.trim() } } : {}),
      collection_ids: s.collection_ids,
    },
  };
}

export default function ProductEditor({ product, options, settings }: { product: EditorProduct; options: EditorOptions; settings: EditorSettings }) {
  const router = useRouter();
  const toast = useToast();
  const [s, setS] = useState<State>(() => initialState(product));
  const baseline = useRef(JSON.stringify(initialState(product), (k, v) => (k === "skuPrefix" || k === "prefixTouched" ? undefined : v)));
  const removedPaths = useRef(new Set<string>());
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Record<string, string>>({});
  const [saving, startSave] = useTransition();
  const [busy, startBusy] = useTransition();
  const canSpin = product.spin !== null && product.spin !== undefined;
  const canName = product.option_names !== null && product.option_names !== undefined;
  const kind = storeKind(settings.storeType);
  const names = optionNames(kind, { size: s.optionSize, color: s.optionColor });

  const dirty = useMemo(() => JSON.stringify(s, (k, v) => (k === "skuPrefix" || k === "prefixTouched" ? undefined : v)) !== baseline.current, [s]);
  const set = useCallback(<K extends keyof State>(key: K, value: State[K]) => setS((x) => ({ ...x, [key]: value })), []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const checkSkus = useCallback(() => {
    const skus = s.variants.map((v) => v.sku.trim()).filter(Boolean);
    skuConflicts(skus, product.id).then((res) => {
      if (res.ok) setConflicts(Object.fromEntries(res.data.map((c) => [c.sku.toUpperCase(), c.title])));
    });
  }, [s.variants, product.id]);

  const save = useCallback(() => {
    const { payload, error: e } = toPayload(s, product.id, product.published_at, canSpin, canName);
    if (!payload) {
      setError(e ?? "Check the form.");
      toast(e ?? "Check the form.", "error");
      return;
    }
    setError(null);
    startSave(async () => {
      const res = await saveProduct(payload, [...removedPaths.current]);
      if (!res.ok) {
        setError(res.error);
        toast(res.error, "error");
        checkSkus();
        return;
      }
      removedPaths.current.clear();
      baseline.current = JSON.stringify(s, (k, v) => (k === "skuPrefix" || k === "prefixTouched" ? undefined : v));
      toast(res.message ?? "Product saved.");
      if (!product.id) router.replace(`/admin/products/${res.data.id}`);
      else router.refresh();
    });
  }, [s, product.id, product.published_at, canSpin, router, toast, checkSkus]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!saving) save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, saving]);

  const setImages = (next: EditorImage[]) => {
    for (const old of s.images) if (old.storage_path && !next.some((n) => n.key === old.key)) removedPaths.current.add(old.storage_path);
    set("images", next);
  };

  const priceMinor = toMinor(s.price);
  const compareMinor = s.compare_at.trim() ? toMinor(s.compare_at) : null;
  const off = priceMinor !== null && compareMinor !== null ? discountPercent(priceMinor, compareMinor) : 0;
  const category = options.categories.find((c) => c.id === s.category_id);
  const categoryGuide = category?.size_guide_id ? options.sizeGuides.find((g) => g.id === category.size_guide_id) : null;
  const visible = s.status === "active" && !s.schedule;
  const slug = s.slug || slugify(s.title);
  const seoTitle = s.seo_title || `${s.title || "Product title"} | ${settings.storeName}`;
  const seoDescription = s.seo_description || s.description.replace(/\s+/g, " ").slice(0, 160) || "Add a description to show a summary here.";
  const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";

  return (
    <div className="pb-16">
      <div className="sticky top-0 z-20 -mx-4 mb-5 flex flex-wrap items-center gap-3 border-b border-black/10 bg-[#f5f5f3]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <Link href="/admin/products" className="text-sm text-taupe hover:text-ink">← Products</Link>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{s.title || (product.id ? "Untitled product" : "New product")}</h1>
        {product.is_sample && <Badge tone="violet">Sample data</Badge>}
        {dirty ? <span className="text-xs text-amber-800">Unsaved changes</span> : product.id ? <span className="text-xs text-stone">All changes saved</span> : null}
        {product.id && (
          <a href={`/products/${product.slug}/preview`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-black/15 bg-white px-3 text-xs hover:border-black/40">
            Preview <ExternalIcon size={12} />
          </a>
        )}
        <Button size="sm" onClick={save} busy={saving} disabled={!dirty && !!product.id} title="Save (Ctrl+S)">
          {product.id ? "Save" : "Save product"}
        </Button>
      </div>

      {error && <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 content-start gap-5">
          <Card>
            <div className="grid gap-4">
              <label className="grid gap-1.5 text-xs font-medium text-taupe">
                Title
                <input
                  value={s.title}
                  onChange={(e) => {
                    const title = e.target.value;
                    setS((x) => {
                      const next = { ...x, title, slug: x.slugTouched ? x.slug : slugify(title) };
                      if (x.prefixTouched) return next;
                      // New product: SKUs follow the title until someone edits the prefix.
                      const skuPrefix = defaultPrefix(title, Number(x.skuPrefix.split("-").pop()) || undefined);
                      const taken = new Set(x.variants.filter((v) => v.id).map((v) => v.sku.toUpperCase()));
                      return { ...next, skuPrefix, variants: x.variants.map((v) => (v.id ? v : { ...v, sku: makeSku(skuPrefix, v.color, v.size, taken) })) };
                    });
                  }}
                  maxLength={200}
                  placeholder="Linen wrap dress"
                  className={cx(adminInput, "h-10 text-base")}
                  autoFocus={!product.id}
                />
              </label>
              <label className="grid gap-1.5 text-xs font-medium text-taupe">
                Description
                <textarea value={s.description} onChange={(e) => set("description", e.target.value)} rows={7} maxLength={20000} className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm leading-relaxed focus:border-ink focus:outline-none" />
                <span className="font-normal text-stone">Leave a blank line between paragraphs.</span>
              </label>
            </div>
          </Card>

          <Card title="Images" actions={<span className="text-xs text-stone">The first image is the main one. Drag to reorder.</span>}>
            <ImageManager images={s.images} onChange={setImages} colors={s.colors.map((c) => c.name)} />
            <div className="mt-4 border-t border-black/10 pt-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={s.spin} disabled={!canSpin} onChange={(e) => set("spin", e.target.checked)} className="size-4 accent-ink" />
                Show as a 360° view
              </label>
              <p className="mt-1 text-xs text-stone">
                {!canSpin ? (
                  <>Needs the database update in <Link href="/admin/setup" className="underline">Admin › Setup</Link>.</>
                ) : s.spin && s.images.length < SPIN_MIN ? (
                  <>Add at least {SPIN_MIN} photos for the 360° view (there {s.images.length === 1 ? "is 1" : `are ${s.images.length}`}). Until then shoppers see the photos as usual.</>
                ) : (
                  <>For photos taken all the way round the piece, in order, at least {SPIN_MIN}. Shoppers drag the picture to turn it.</>
                )}
              </p>
            </div>
          </Card>

          <Card title="Pricing">
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="grid gap-1.5 text-xs font-medium text-taupe">
                Price (₹)
                <input value={s.price} onChange={(e) => set("price", e.target.value)} inputMode="decimal" placeholder="2499" className={adminInput} />
                <span className="font-normal text-stone">{settings.taxMode === "inclusive" ? `Including ${settings.taxLabel}` : settings.taxMode === "exclusive" ? `${settings.taxLabel} added at checkout` : "No tax applied"}</span>
              </label>
              <label className="grid gap-1.5 text-xs font-medium text-taupe">
                Compare-at price (₹)
                <input value={s.compare_at} onChange={(e) => set("compare_at", e.target.value)} inputMode="decimal" placeholder="Not on sale" className={adminInput} />
                <span className="font-normal text-stone">{off > 0 ? `Shows as ${off}% off` : "The original price, shown struck through"}</span>
              </label>
              <div className="grid content-start gap-1.5 text-xs font-medium text-taupe">
                <label htmlFor="tax-mode">Tax rate</label>
                <div className="flex gap-2">
                  <select id="tax-mode" value={s.taxMode} onChange={(e) => set("taxMode", e.target.value as State["taxMode"])} className={cx(adminInput, "flex-1")}>
                    <option value="default">Store default</option>
                    <option value="fixed">Fixed rate</option>
                  </select>
                  {s.taxMode === "fixed" && (
                    <span className="relative">
                      <input aria-label="Tax rate percent" value={s.taxPercent} onChange={(e) => set("taxPercent", e.target.value)} inputMode="decimal" className={cx(adminInput, "w-20 pr-6")} />
                      <span className="pointer-events-none absolute top-2 right-2 text-sm text-stone">%</span>
                    </span>
                  )}
                </div>
                <span className="font-normal text-stone">{s.taxMode === "default" ? `${settings.taxLabel} slabs from Settings, by price` : "Overrides the slabs for this product"}</span>
              </div>
            </div>
          </Card>

          <Card title="Variants" actions={<span className="text-xs text-stone">{names.size} × {names.color.toLowerCase()}, each with its own SKU and stock</span>}>
            {canName && (
              <div className="mb-5 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-xs font-medium text-taupe">
                  First option is called
                  <input value={s.optionSize} onChange={(e) => set("optionSize", e.target.value)} maxLength={30} placeholder={kind.options.size} className={adminInput} />
                </label>
                <label className="grid gap-1.5 text-xs font-medium text-taupe">
                  Second option is called
                  <input value={s.optionColor} onChange={(e) => set("optionColor", e.target.value)} maxLength={30} placeholder={kind.options.color} className={adminInput} />
                </label>
                <p className="text-xs text-stone sm:col-span-2">
                  Leave empty for the store&apos;s own ({kind.options.size} and {kind.options.color.toLowerCase()}). Name them for this product when it&apos;s different, like Pack size and Flavour.
                </p>
              </div>
            )}
            <VariantsEditor
              variants={s.variants}
              onChange={(v) => set("variants", v)}
              sizes={s.sizes}
              colors={s.colors}
              onOptions={(sizes, colors, variants) => setS((x) => ({ ...x, sizes, colors, variants }))}
              skuPrefix={s.skuPrefix}
              onSkuPrefix={(v) => setS((x) => ({ ...x, skuPrefix: v, prefixTouched: true }))}
              conflicts={conflicts}
              onCheckSkus={checkSkus}
              lowStockDefault={settings.lowStockThreshold}
              names={names}
              sizeSets={kind.sizeSets}
            />
          </Card>

          <Card title="Details">
            <div className="grid gap-4 md:grid-cols-3">
              {(["fabric", "fit", "care"] as const).map((k) => (
                <label key={k} className="grid gap-1.5 text-xs font-medium text-taupe">
                  {k === "fabric" ? kind.details.material : k === "fit" ? kind.details.fit : kind.details.care}
                  <textarea
                    value={s[k]}
                    onChange={(e) => set(k, e.target.value)}
                    rows={4}
                    maxLength={2000}
                    placeholder={k === "fabric" ? kind.detailExamples.material : k === "fit" ? kind.detailExamples.fit : kind.detailExamples.care}
                    className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm focus:border-ink focus:outline-none"
                  />
                </label>
              ))}
            </div>
          </Card>

          <div className="grid gap-5 md:grid-cols-2">
            <Card title="Shipping">
              <div className="grid grid-cols-2 gap-3">
                <label className="col-span-2 grid gap-1.5 text-xs font-medium text-taupe">
                  Weight (grams)
                  <input value={s.weight} onChange={(e) => set("weight", e.target.value)} inputMode="numeric" placeholder="e.g. 450" className={adminInput} />
                </label>
                {(["length", "width", "height"] as const).map((k) => (
                  <label key={k} className={cx("grid gap-1.5 text-xs font-medium text-taupe", k === "height" && "col-span-2 sm:col-span-1")}>
                    {k[0].toUpperCase() + k.slice(1)} (cm)
                    <input value={s[k]} onChange={(e) => set(k, e.target.value)} inputMode="decimal" className={adminInput} />
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-stone">Packed size, for courier rates and labels.</p>
            </Card>
            <Card title="Returns">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={s.is_returnable} onChange={(e) => set("is_returnable", e.target.checked)} className="size-4 accent-ink" />
                Customers can return this product
              </label>
              {s.is_returnable && (
                <label className="mt-3 grid gap-1.5 text-xs font-medium text-taupe">
                  Return window (days)
                  <input value={s.returnDays} onChange={(e) => set("returnDays", e.target.value)} inputMode="numeric" placeholder={`${settings.returnWindowDays} (store default)`} className={adminInput} />
                </label>
              )}
              <p className="mt-2 text-xs text-stone">{s.is_returnable ? "Counted from delivery." : "Shown on the product page as final sale."}</p>
            </Card>
          </div>

          <Card title="Search engine listing">
            <div className="rounded-md border border-black/10 bg-white p-3">
              <p className="truncate text-xs text-emerald-800">{settings.siteUrl.replace(/^https?:\/\//, "")} › products › {slug || "…"}</p>
              <p className="mt-0.5 truncate text-[17px] text-[#1a0dab]">{seoTitle}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-taupe">{seoDescription}</p>
            </div>
            <div className="mt-4 grid gap-4">
              <label className="grid gap-1.5 text-xs font-medium text-taupe">
                <span className="flex justify-between">Page title <span className="font-normal text-stone">{s.seo_title.length}/70</span></span>
                <input value={s.seo_title} onChange={(e) => set("seo_title", e.target.value)} maxLength={120} placeholder={seoTitle} className={adminInput} />
              </label>
              <label className="grid gap-1.5 text-xs font-medium text-taupe">
                <span className="flex justify-between">Meta description <span className="font-normal text-stone">{s.seo_description.length}/160</span></span>
                <textarea value={s.seo_description} onChange={(e) => set("seo_description", e.target.value)} maxLength={320} rows={2} className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm focus:border-ink focus:outline-none" />
              </label>
              <label className="grid gap-1.5 text-xs font-medium text-taupe">
                URL handle
                <div className="flex items-center rounded-md border border-black/15 bg-white focus-within:border-ink">
                  <span className="pl-2.5 text-sm text-stone">/products/</span>
                  <input
                    value={s.slug}
                    onChange={(e) => setS((x) => ({ ...x, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"), slugTouched: true }))}
                    onBlur={() => set("slug", slugify(s.slug) || slugify(s.title))}
                    maxLength={120}
                    className="h-9 min-w-0 flex-1 bg-transparent pr-2.5 text-sm outline-none"
                  />
                </div>
                {product.id && s.slug !== product.slug && <span className="font-normal text-amber-800">Changing the handle breaks links people have saved or shared.</span>}
              </label>
            </div>
          </Card>
        </div>

        <div className="grid min-w-0 content-start gap-5">
          <Card title="Status">
            <div className="grid gap-3">
              <select aria-label="Status" value={s.status} onChange={(e) => set("status", e.target.value as State["status"])} className={adminInput}>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
              {s.status === "active" && (
                <>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={s.schedule} onChange={(e) => set("schedule", e.target.checked)} className="size-4 accent-ink" />
                    Schedule for later
                  </label>
                  {s.schedule && (
                    <label className="grid gap-1.5 text-xs font-medium text-taupe">
                      Publish on
                      <input type="datetime-local" value={s.publishAt} onChange={(e) => set("publishAt", e.target.value)} className={adminInput} />
                      <span className="font-normal text-stone">Your time zone{tz ? ` (${tz})` : ""}.</span>
                    </label>
                  )}
                </>
              )}
              <p className="text-xs text-taupe">
                {visible ? "Visible in the store once saved." : s.status === "active" ? "Hidden until the scheduled time, then it goes live by itself." : s.status === "draft" ? "Hidden from customers. Staff can preview it." : "Hidden and kept for records."}
              </p>
              <label className="inline-flex items-center gap-2 border-t border-black/10 pt-3 text-sm">
                <input type="checkbox" checked={s.is_featured} onChange={(e) => set("is_featured", e.target.checked)} className="size-4 accent-ink" />
                Feature on the homepage
              </label>
            </div>
          </Card>

          <Card title="Organisation">
            <div className="grid gap-3.5">
              <label className="grid gap-1.5 text-xs font-medium text-taupe">
                Brand
                <select value={s.brand_id} onChange={(e) => set("brand_id", e.target.value)} className={adminInput}>
                  <option value="">No brand</option>
                  {options.brands.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
              </label>
              <label className="grid gap-1.5 text-xs font-medium text-taupe">
                Category
                <select value={s.category_id} onChange={(e) => set("category_id", e.target.value)} className={adminInput}>
                  <option value="">No category</option>
                  {options.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
              <label className="grid gap-1.5 text-xs font-medium text-taupe">
                Size guide
                <select value={s.size_guide_id} onChange={(e) => set("size_guide_id", e.target.value)} className={adminInput}>
                  <option value="">{categoryGuide ? `Category's guide (${categoryGuide.label})` : "None"}</option>
                  {options.sizeGuides.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                </select>
              </label>
              <ChipsInput id="tags" label="Tags" values={s.tags} onChange={(t) => set("tags", t)} placeholder="linen, summer" suggestions={options.tagSuggestions} />
              {options.collections.length > 0 && (
                <fieldset className="grid gap-1.5">
                  <legend className="mb-1 text-xs font-medium text-taupe">Collections</legend>
                  <div className="grid max-h-48 gap-1.5 overflow-y-auto">
                    {options.collections.map((c) => (
                      <label key={c.id} className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-ink"
                          checked={s.collection_ids.includes(c.id)}
                          onChange={(e) => set("collection_ids", e.target.checked ? [...s.collection_ids, c.id] : s.collection_ids.filter((x) => x !== c.id))}
                        />
                        {c.label}
                      </label>
                    ))}
                  </div>
                  <span className="text-xs text-stone">Automated collections add products by their rules.</span>
                </fieldset>
              )}
            </div>
          </Card>

          {product.id && (
            <Card title="Summary">
              <dl className="grid gap-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-taupe">Units on hand</dt><dd className="tabular-nums">{s.variants.reduce((n, v) => n + (Number(v.stock) || 0), 0)}</dd></div>
                <div className="flex justify-between"><dt className="text-taupe">Held by unpaid orders</dt><dd className="tabular-nums">{s.variants.reduce((n, v) => n + v.reserved, 0)}</dd></div>
                <div className="flex justify-between"><dt className="text-taupe">Variants</dt><dd className="tabular-nums">{s.variants.length} ({s.variants.filter((v) => v.is_active).length} on sale)</dd></div>
                <div className="flex justify-between"><dt className="text-taupe">Created</dt><dd>{formatDateTime(product.created_at)}</dd></div>
                <div className="flex justify-between"><dt className="text-taupe">Updated</dt><dd>{formatDateTime(product.updated_at)}</dd></div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-black/10 pt-3">
                <Link href={`/admin/inventory?q=${encodeURIComponent(product.variants[0]?.sku ?? "")}`} className="text-xs underline">Stock history</Link>
                <button
                  type="button"
                  className="text-xs underline"
                  disabled={busy}
                  onClick={() =>
                    startBusy(async () => {
                      const res = await duplicateProduct(product.id!);
                      if (!res.ok) return toast(res.error, "error");
                      toast(res.message ?? "Copied.");
                      router.push(`/admin/products/${res.data.id}`);
                    })
                  }
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className="ml-auto text-xs text-red-700 underline"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm("Delete this product? If it appears in past orders it will be archived instead.")) return;
                    startBusy(async () => {
                      const res = await deleteProducts([product.id!]);
                      if (!res.ok) return toast(res.error, "error");
                      toast(res.message ?? "Deleted.");
                      router.push("/admin/products");
                    });
                  }}
                >
                  Delete product
                </button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
