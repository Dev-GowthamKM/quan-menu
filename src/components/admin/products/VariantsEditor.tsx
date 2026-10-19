"use client";
import { useMemo, useState } from "react";
import { cx } from "../../ui/controls";
import { TrashIcon } from "../../ui/icons";
import ChipsInput from "../ChipsInput";
import { adminInput } from "../ui";

export interface VariantRow {
  key: string;
  id: string | null;
  sku: string;
  size: string;
  color: string;
  color_hex: string | null;
  /** Rupees as typed; blank means the product price. */
  price: string;
  compare_at: string;
  stock: string;
  /** Stock when the editor loaded, so saving applies a change on top of new orders. */
  stock_loaded: number | null;
  reserved: number;
  low_stock_threshold: string;
  barcode: string;
  weight_grams: string;
  is_active: boolean;
}

export interface ColorOption {
  name: string;
  hex: string | null;
}

const SIZE_PRESETS: { label: string; sizes: string[] }[] = [
  { label: "XS – XL", sizes: ["XS", "S", "M", "L", "XL"] },
  { label: "S – XXL", sizes: ["S", "M", "L", "XL", "XXL"] },
  { label: "Waist 28 – 38", sizes: ["28", "30", "32", "34", "36", "38"] },
  { label: "UK 3 – 9", sizes: ["UK 3", "UK 4", "UK 5", "UK 6", "UK 7", "UK 8", "UK 9"] },
  { label: "Free size", sizes: ["Free Size"] },
];

export const COLOR_PRESETS: Record<string, string> = {
  black: "#111111", white: "#ffffff", ivory: "#f4efe6", cream: "#efe6d2", ecru: "#e9e0cc", beige: "#d9c7a7", sand: "#d8c3a0",
  camel: "#b98b57", tan: "#c19a6b", brown: "#6b4a32", chocolate: "#4a2f22", cognac: "#9a5b2f", rust: "#a3532d", terracotta: "#b5603f",
  red: "#b3261e", maroon: "#6d1f2b", wine: "#5c1a2b", burgundy: "#6a1e2d", pink: "#e7a9b6", blush: "#e8c4c0", rose: "#c9737f",
  orange: "#d9772b", mustard: "#c99a2e", yellow: "#e6c24a", olive: "#6b6b3a", khaki: "#a39a6e", sage: "#a7b59a", green: "#3f7a4f",
  emerald: "#2f6b4f", bottle: "#1f4d3a", teal: "#2d6e73", mint: "#bfe0cf", blue: "#2f5d9e", "sky blue": "#8cb8e0", indigo: "#2e3a6e",
  navy: "#1f2a44", denim: "#3b5878", purple: "#5b3a7a", lavender: "#b9a7d6", lilac: "#c8a9d1", grey: "#8a8d91", gray: "#8a8d91",
  charcoal: "#3a3b3d", silver: "#c0c0c0", gold: "#c5a253", pewter: "#8e9196", multicolour: "#999999",
};

function code(s: string, len: number) {
  return s.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, len);
}

/** "ABC-123" + Navy + M -> "ABC-123-NAV-M". */
export function makeSku(prefix: string, color: string, size: string, taken: Set<string>) {
  const base = [prefix.trim().toUpperCase().replace(/[^A-Z0-9._/-]+/g, "-").replace(/^-+|-+$/g, "") || "SKU", color && code(color, 3), size && code(size, 8)]
    .filter(Boolean)
    .join("-")
    .slice(0, 60);
  let sku = base;
  for (let n = 2; taken.has(sku.toUpperCase()); n++) sku = `${base}-${n}`;
  taken.add(sku.toUpperCase());
  return sku;
}

export function newVariant(patch: Partial<VariantRow>): VariantRow {
  return {
    key: crypto.randomUUID(), id: null, sku: "", size: "", color: "", color_hex: null, price: "", compare_at: "", stock: "0",
    stock_loaded: null, reserved: 0, low_stock_threshold: "", barcode: "", weight_grams: "", is_active: true, ...patch,
  };
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export default function VariantsEditor({
  variants, onChange, sizes, colors, onOptions, skuPrefix, onSkuPrefix, conflicts, onCheckSkus, lowStockDefault,
}: {
  variants: VariantRow[];
  onChange: (next: VariantRow[]) => void;
  sizes: string[];
  colors: ColorOption[];
  onOptions: (sizes: string[], colors: ColorOption[], variants: VariantRow[]) => void;
  skuPrefix: string;
  onSkuPrefix: (v: string) => void;
  conflicts: Record<string, string>;
  onCheckSkus: () => void;
  lowStockDefault: number;
}) {
  const [more, setMore] = useState(false);
  const [fill, setFill] = useState({ stock: "", price: "" });

  const dupes = useMemo(() => {
    const seen = new Map<string, number>();
    for (const v of variants) if (v.sku.trim()) seen.set(v.sku.trim().toUpperCase(), (seen.get(v.sku.trim().toUpperCase()) ?? 0) + 1);
    return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
  }, [variants]);

  /** Removing an option value removes its variants; removing the last value just clears it. */
  const removeValue = (rows: VariantRow[], dim: "size" | "color", value: string, remaining: number) => {
    const affected = rows.filter((v) => same(v[dim], value));
    if (remaining === 0) return rows.map((v) => (same(v[dim], value) ? { ...v, [dim]: "", ...(dim === "color" ? { color_hex: null } : {}) } : v));
    const saved = affected.filter((v) => v.id);
    if (saved.length && !window.confirm(`Remove ${affected.length} variant${affected.length === 1 ? "" : "s"} with ${dim} "${value}"? Past orders keep their details.`)) return null;
    return rows.filter((v) => !same(v[dim], value));
  };

  const setSizes = (next: string[]) => {
    const added = next.filter((s) => !sizes.some((x) => same(x, s)));
    const removed = sizes.filter((s) => !next.some((x) => same(x, s)));
    let rows = variants;
    let current = [...sizes];
    for (const r of removed) {
      current = current.filter((s) => !same(s, r));
      const res = removeValue(rows, "size", r, current.length);
      if (!res) return;
      rows = res;
    }
    for (const a of added) {
      rows = addValueOn(rows, "size", a, null, current, colors);
      current.push(a);
    }
    onOptions(next, colors, rows);
  };

  /** Adds rows for a new size or colour; the first value of an option fills existing blank rows. */
  const addValueOn = (rows: VariantRow[], dim: "size" | "color", value: string, hex: string | null, currentSizes: string[], currentColors: ColorOption[]) => {
    const other = dim === "size" ? currentColors.map((c) => c.name) : currentSizes;
    const firstOfDim = (dim === "size" ? currentSizes : currentColors).length === 0;
    const t = new Set(rows.map((v) => v.sku.trim().toUpperCase()).filter(Boolean));
    let out = [...rows];
    if (firstOfDim && out.length) {
      out = out.map((v) => {
        if (v[dim]) return v;
        const next = { ...v, [dim]: value, ...(dim === "color" ? { color_hex: hex } : {}) };
        if (!v.id) next.sku = makeSku(skuPrefix, next.color, next.size, t);
        return next;
      });
    } else {
      for (const o of other.length ? other : [""]) {
        const size = dim === "size" ? value : o;
        const color = dim === "color" ? value : o;
        if (out.some((v) => same(v.size, size) && same(v.color, color))) continue;
        const colorHex = dim === "color" ? hex : currentColors.find((c) => same(c.name, color))?.hex ?? null;
        out.push(newVariant({ size, color, color_hex: colorHex, sku: makeSku(skuPrefix, color, size, t) }));
      }
    }
    return out;
  };

  const setColorNames = (names: string[]) => {
    const added = names.filter((n) => !colors.some((c) => same(c.name, n)));
    const removed = colors.filter((c) => !names.some((n) => same(n, c.name)));
    let rows = variants;
    let current = [...colors];
    for (const r of removed) {
      current = current.filter((c) => !same(c.name, r.name));
      const res = removeValue(rows, "color", r.name, current.length);
      if (!res) return;
      rows = res;
    }
    for (const a of added) {
      const hex = COLOR_PRESETS[a.trim().toLowerCase()] ?? null;
      rows = addValueOn(rows, "color", a, hex, sizes, current);
      current.push({ name: a, hex });
    }
    onOptions(sizes, names.map((n) => current.find((c) => same(c.name, n)) ?? { name: n, hex: null }), rows);
  };

  const setHex = (name: string, hex: string) =>
    onOptions(
      sizes,
      colors.map((c) => (c.name === name ? { ...c, hex } : c)),
      variants.map((v) => (same(v.color, name) ? { ...v, color_hex: hex } : v)),
    );

  const update = (key: string, patch: Partial<VariantRow>) => onChange(variants.map((v) => (v.key === key ? { ...v, ...patch } : v)));

  const regenerateSkus = () => {
    const t = new Set<string>();
    // Saved variants keep their SKUs (orders and labels refer to them).
    for (const v of variants) if (v.id) t.add(v.sku.trim().toUpperCase());
    onChange(variants.map((v) => (v.id ? v : { ...v, sku: makeSku(skuPrefix, v.color, v.size, t) })));
  };

  const totalStock = variants.reduce((n, v) => n + (Number(v.stock) || 0), 0);

  return (
    <div className="grid gap-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <ChipsInput id="opt-sizes" label="Sizes" values={sizes} onChange={setSizes} placeholder="Type a size and press Enter" maxLength={30} />
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
            {SIZE_PRESETS.map((p) => (
              <button key={p.label} type="button" className="rounded border border-black/10 px-1.5 py-0.5 text-taupe hover:border-black/30 hover:text-ink" onClick={() => setSizes([...sizes, ...p.sizes.filter((s) => !sizes.some((x) => same(x, s)))])}>
                + {p.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <ChipsInput id="opt-colors" label="Colours" values={colors.map((c) => c.name)} onChange={setColorNames} placeholder="Type a colour and press Enter" suggestions={Object.keys(COLOR_PRESETS).map((c) => c[0].toUpperCase() + c.slice(1))} />
          {colors.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {colors.map((c) => (
                <label key={c.name} className="inline-flex items-center gap-1.5 text-xs text-taupe" title={`Swatch colour for ${c.name}`}>
                  <input type="color" value={c.hex ?? "#cccccc"} onChange={(e) => setHex(c.name, e.target.value)} className="size-6 cursor-pointer rounded border border-black/15 bg-white p-0.5" aria-label={`Swatch for ${c.name}`} />
                  {c.name}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-md bg-black/[0.03] p-3">
        <label className="grid gap-1 text-xs font-medium text-taupe">
          SKU prefix
          <input value={skuPrefix} onChange={(e) => onSkuPrefix(e.target.value.toUpperCase())} className={cx(adminInput, "w-36 uppercase")} maxLength={30} />
        </label>
        <button type="button" onClick={regenerateSkus} className="h-9 rounded-md border border-black/15 bg-white px-3 text-sm hover:border-black/40">Regenerate new SKUs</button>
        <span className="mx-1 hidden h-9 w-px bg-black/10 sm:block" />
        <label className="grid gap-1 text-xs font-medium text-taupe">
          Stock for all
          <input value={fill.stock} onChange={(e) => setFill({ ...fill, stock: e.target.value })} inputMode="numeric" className={cx(adminInput, "w-24")} />
        </label>
        <button type="button" disabled={!/^\d+$/.test(fill.stock)} onClick={() => onChange(variants.map((v) => ({ ...v, stock: fill.stock })))} className="h-9 rounded-md border border-black/15 bg-white px-3 text-sm hover:border-black/40 disabled:opacity-40">Apply</button>
        <label className="grid gap-1 text-xs font-medium text-taupe">
          Price for all (₹)
          <input value={fill.price} onChange={(e) => setFill({ ...fill, price: e.target.value })} inputMode="decimal" placeholder="Product price" className={cx(adminInput, "w-28")} />
        </label>
        <button type="button" onClick={() => onChange(variants.map((v) => ({ ...v, price: fill.price.trim() })))} className="h-9 rounded-md border border-black/15 bg-white px-3 text-sm hover:border-black/40">Apply</button>
        <label className="ml-auto inline-flex items-center gap-2 text-xs text-taupe">
          <input type="checkbox" checked={more} onChange={(e) => setMore(e.target.checked)} className="size-4 accent-ink" /> More columns
        </label>
      </div>

      <div className="overflow-x-auto rounded-md border border-black/10">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="bg-[#fafaf9] text-left text-xs text-taupe">
              <th className="px-2.5 py-2 font-medium">Variant</th>
              <th className="px-2.5 py-2 font-medium">SKU</th>
              <th className="px-2.5 py-2 font-medium">Price (₹)</th>
              <th className="px-2.5 py-2 font-medium">Compare-at (₹)</th>
              <th className="px-2.5 py-2 font-medium">On hand</th>
              <th className="px-2.5 py-2 font-medium" title="Held by orders waiting for payment">Held</th>
              {more && <th className="px-2.5 py-2 font-medium">Low alert</th>}
              {more && <th className="px-2.5 py-2 font-medium">Barcode</th>}
              {more && <th className="px-2.5 py-2 font-medium">Weight (g)</th>}
              <th className="px-2.5 py-2 font-medium">Sell</th>
              <th className="px-2.5 py-2"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => {
              const upper = v.sku.trim().toUpperCase();
              const skuError = !v.sku.trim() ? "Required" : dupes.has(upper) ? "Duplicate" : conflicts[upper] ? `Used by ${conflicts[upper]}` : null;
              const label = [v.color, v.size].filter(Boolean).join(" / ") || "Default";
              return (
                <tr key={v.key} className={cx("border-t border-black/5 align-top", !v.is_active && "bg-black/[0.02] text-stone")}>
                  <td className="px-2.5 py-2">
                    <span className="inline-flex items-center gap-2 pt-2 whitespace-nowrap">
                      {v.color && <span className="size-3.5 rounded-full border border-black/15" style={{ background: v.color_hex ?? "transparent" }} />}
                      {label}
                    </span>
                  </td>
                  <td className="px-2.5 py-2">
                    <input
                      aria-label={`SKU for ${label}`}
                      value={v.sku}
                      onChange={(e) => update(v.key, { sku: e.target.value.toUpperCase() })}
                      onBlur={onCheckSkus}
                      maxLength={64}
                      className={cx(adminInput, "h-8 w-40 font-mono text-xs uppercase", skuError && "border-red-500")}
                      aria-invalid={!!skuError}
                    />
                    {skuError && <p className="mt-0.5 max-w-40 text-[11px] text-red-700">{skuError}</p>}
                  </td>
                  <td className="px-2.5 py-2">
                    <input aria-label={`Price for ${label}`} value={v.price} onChange={(e) => update(v.key, { price: e.target.value })} inputMode="decimal" placeholder="Default" className={cx(adminInput, "h-8 w-24")} />
                  </td>
                  <td className="px-2.5 py-2">
                    <input aria-label={`Compare-at price for ${label}`} value={v.compare_at} onChange={(e) => update(v.key, { compare_at: e.target.value })} inputMode="decimal" placeholder="Default" className={cx(adminInput, "h-8 w-24")} />
                  </td>
                  <td className="px-2.5 py-2">
                    <input aria-label={`Stock for ${label}`} value={v.stock} onChange={(e) => update(v.key, { stock: e.target.value })} inputMode="numeric" className={cx(adminInput, "h-8 w-20 tabular-nums", !/^\d+$/.test(v.stock) && "border-red-500")} />
                  </td>
                  <td className="px-2.5 py-2 pt-4 text-xs text-stone tabular-nums">{v.reserved || "—"}</td>
                  {more && (
                    <td className="px-2.5 py-2">
                      <input aria-label={`Low stock alert for ${label}`} value={v.low_stock_threshold} onChange={(e) => update(v.key, { low_stock_threshold: e.target.value })} inputMode="numeric" placeholder={String(lowStockDefault)} className={cx(adminInput, "h-8 w-16")} />
                    </td>
                  )}
                  {more && (
                    <td className="px-2.5 py-2">
                      <input aria-label={`Barcode for ${label}`} value={v.barcode} onChange={(e) => update(v.key, { barcode: e.target.value })} maxLength={64} className={cx(adminInput, "h-8 w-32")} />
                    </td>
                  )}
                  {more && (
                    <td className="px-2.5 py-2">
                      <input aria-label={`Weight for ${label}`} value={v.weight_grams} onChange={(e) => update(v.key, { weight_grams: e.target.value })} inputMode="numeric" placeholder="Product" className={cx(adminInput, "h-8 w-20")} />
                    </td>
                  )}
                  <td className="px-2.5 py-2 pt-3.5">
                    <input type="checkbox" aria-label={`Sell ${label}`} checked={v.is_active} onChange={(e) => update(v.key, { is_active: e.target.checked })} className="size-4 accent-ink" />
                  </td>
                  <td className="px-2.5 py-2 pt-3">
                    <button
                      type="button"
                      disabled={variants.length === 1}
                      onClick={() => {
                        if (v.id && !window.confirm(`Remove ${label}? Past orders keep their details.`)) return;
                        onChange(variants.filter((x) => x.key !== v.key));
                      }}
                      className="text-stone hover:text-red-700 disabled:opacity-30"
                      aria-label={`Remove ${label}`}
                    >
                      <TrashIcon size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="-mt-2 flex flex-wrap justify-between gap-2 text-xs text-stone">
        <span>{variants.length} {variants.length === 1 ? "variant" : "variants"} · {totalStock} units on hand. Blank prices use the product price.</span>
        <span>Untick &ldquo;Sell&rdquo; to hide a variant without deleting it.</span>
      </p>
    </div>
  );
}
