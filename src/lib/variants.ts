import type { PageVariant } from "./types";

// A product's two options (size and colour, or the store's own names for them), worked out from its
// variants, for the product page and for adding to the bag from a list (Quick add).

export interface ColorOption {
  name: string;
  hex: string | null;
  /** How many are left across its sizes. */
  available: number;
}

/** The colours (second option) in the order the variants list them, with how many are left of each. */
export function colorsOf(variants: PageVariant[]): ColorOption[] {
  const list: ColorOption[] = [];
  for (const v of variants) {
    if (!v.color) continue;
    const existing = list.find((c) => c.name === v.color);
    if (existing) existing.available += v.available;
    else list.push({ name: v.color, hex: v.color_hex, available: v.available });
  }
  return list;
}

/** The sizes (first option) in the order the variants list them. */
export function sizesOf(variants: PageVariant[]): string[] {
  const seen: string[] = [];
  for (const v of variants) if (v.size && !seen.includes(v.size)) seen.push(v.size);
  return seen;
}

/** The variant for a colour and a size; an option the product doesn't have is ignored. */
export function variantFor(variants: PageVariant[], color: string | null, size: string | null) {
  const hasColor = variants.some((v) => v.color);
  const hasSize = variants.some((v) => v.size);
  return variants.find((v) => (v.color || null) === (hasColor ? color : null) && (v.size || null) === (hasSize ? size : null));
}

/** The colour to show first: one that's in stock, else the first. */
export function firstColor(colors: ColorOption[]) {
  return colors.find((c) => c.available > 0)?.name ?? colors[0]?.name ?? null;
}
