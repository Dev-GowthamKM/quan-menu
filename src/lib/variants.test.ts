import { describe, expect, it } from "vitest";
import type { PageVariant } from "./types";
import { colorsOf, firstColor, sizesOf, variantFor } from "./variants";

const v = (id: string, color: string, size: string, available: number, hex: string | null = null): PageVariant => ({
  id, sku: id, color, size, color_hex: hex, price: 1000, compare_at_price: null, available,
});

describe("variants", () => {
  const tee = [v("a", "Black", "S", 0, "#000"), v("b", "Black", "M", 3, "#000"), v("c", "Ivory", "S", 2, "#fff"), v("d", "Ivory", "M", 0, "#fff")];

  it("lists colours with what's left of each, and sizes, in the order given", () => {
    expect(colorsOf(tee)).toEqual([{ name: "Black", hex: "#000", available: 3 }, { name: "Ivory", hex: "#fff", available: 2 }]);
    expect(sizesOf(tee)).toEqual(["S", "M"]);
  });

  it("finds the variant for a colour and size", () => {
    expect(variantFor(tee, "Ivory", "S")?.id).toBe("c");
    expect(variantFor(tee, "Ivory", "L")).toBeUndefined();
    expect(variantFor(tee, null, "S")).toBeUndefined();
  });

  it("ignores an option the product doesn't have", () => {
    const sizesOnly = [v("x", "", "250 g", 4), v("y", "", "1 kg", 0)];
    expect(colorsOf(sizesOnly)).toEqual([]);
    expect(variantFor(sizesOnly, "Anything", "1 kg")?.id).toBe("y");
    const single = [v("z", "", "", 5)];
    expect(variantFor(single, null, null)?.id).toBe("z");
  });

  it("starts on a colour that's in stock", () => {
    expect(firstColor(colorsOf([v("a", "Red", "S", 0), v("b", "Blue", "S", 1)]))).toBe("Blue");
    expect(firstColor(colorsOf([v("a", "Red", "S", 0)]))).toBe("Red");
    expect(firstColor([])).toBeNull();
  });
});
