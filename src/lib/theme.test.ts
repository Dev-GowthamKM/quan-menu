import { describe, expect, it } from "vitest";
import { BODY_FONTS, chapterColors, contrast, HEADING_FONTS, mix, onColor, PALETTES, paletteOf, readable, themeOf, themeTokens, themeWarnings } from "./theme";

describe("colour arithmetic", () => {
  it("measures contrast the WCAG way", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#777777")).toBeCloseTo(1, 5);
    expect(contrast("#767676", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("mixes from one colour to the other", () => {
    expect(mix("#6b1d2e", "#fbf6ee", 0)).toBe("#6b1d2e");
    expect(mix("#6b1d2e", "#fbf6ee", 1)).toBe("#fbf6ee");
    expect(mix("#000000", "#ffffff", 0.5)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("darkens a pale colour until it reads, and leaves a readable one alone", () => {
    expect(readable("#1f1416", "#ffffff")).toBe("#1f1416");
    const gold = readable("#e0b84f", "#fbf6ee");
    expect(contrast(gold, "#fbf6ee")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(readable("#2a2a2a", "#111111"), "#111111")).toBeGreaterThanOrEqual(4.5);
  });

  it("puts light words on dark buttons and dark words on light ones", () => {
    const c = { text: "#1f1416", brand: "#6b1d2e", accent: "#b07d2b", background: "#fbf6ee" };
    expect(onColor("#6b1d2e", c)).toBe("#fbf6ee");
    expect(onColor("#f2d16b", c)).toBe("#1f1416");
  });
});

describe("palettes", () => {
  it("have unique keys", () => {
    expect(new Set(PALETTES.map((p) => p.key)).size).toBe(PALETTES.length);
  });

  for (const p of PALETTES) {
    it(`${p.name} is readable everywhere`, () => {
      const t = themeTokens(p.colors);
      expect(themeWarnings(p.colors)).toEqual([]);
      for (const surface of [t["--color-ivory"], t["--color-paper"], t["--color-bone"], t["--color-sand"]]) {
        expect(contrast(t["--color-ink"], surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t["--color-taupe"], surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t["--color-accent"], surface)).toBeGreaterThanOrEqual(4.5);
      }
      for (const surface of [t["--color-ivory"], t["--color-paper"], t["--color-bone"]]) {
        expect(contrast(t["--color-stone"], surface)).toBeGreaterThanOrEqual(4.5);
      }
      for (const surface of [t["--color-ivory"], t["--color-paper"], t["--color-bone"], t["--color-sand"]]) {
        expect(contrast(t["--color-sale"], surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t["--color-ok"], surface)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(t["--color-ink"], t["--color-field"])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t["--color-on-brand"], t["--color-brand"])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t["--color-on-brand-soft"], t["--color-brand"])).toBeGreaterThanOrEqual(4.5);
      // The Spotlight's backgrounds change as the shopper scrolls, and every one stays readable.
      const chapters = chapterColors(p.colors, 4);
      expect(chapters[0]).toBe(p.colors.background.toLowerCase());
      expect(new Set(chapters).size).toBeGreaterThan(1);
      for (const bg of chapters) {
        expect(contrast(t["--color-ink"], bg)).toBeGreaterThanOrEqual(7);
        expect(contrast(t["--color-taupe"], bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t["--color-accent"], bg)).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it("recognises a palette from its colours, in any letter case", () => {
    const wine = PALETTES[0];
    expect(paletteOf({ ...wine.colors, brand: wine.colors.brand.toUpperCase() })?.key).toBe("wine");
    expect(paletteOf({ ...wine.colors, brand: "#123456" })).toBeUndefined();
  });

  it("warns about colours that can't be read", () => {
    const warnings = themeWarnings({ text: "#cccccc", brand: "#f4efe6", accent: "#b07d2b", background: "#ffffff" });
    expect(warnings).toHaveLength(2);
  });
});

describe("themeOf", () => {
  it("shows the new default on a store still on the original palette, before the theme migration", () => {
    expect(themeOf({ primary_color: "#111111", accent_color: "#8C6A43", background_color: "#f7f3ec" })).toEqual({
      colors: PALETTES[0].colors,
      italic: true,
    });
  });

  it("keeps a store's own colours before the migration, with buttons in the text colour", () => {
    expect(themeOf({ primary_color: "#222222", accent_color: "#8c6a43", background_color: "#ffffff" })).toEqual({
      colors: { text: "#222222", brand: "#222222", accent: "#8c6a43", background: "#ffffff" },
      italic: true,
    });
  });

  it("uses the saved brand colour and heading style", () => {
    const t = themeOf({ primary_color: "#1f1416", brand_color: "#6b1d2e", accent_color: "#b07d2b", background_color: "#fbf6ee", heading_italic: false });
    expect(t.colors.brand).toBe("#6b1d2e");
    expect(t.italic).toBe(false);
  });
});

describe("fonts", () => {
  it("each have a weight they can be set in", () => {
    for (const f of [...Object.values(HEADING_FONTS), ...Object.values(BODY_FONTS)]) {
      expect(f.weight).toBeGreaterThanOrEqual(f.min);
      expect(f.weight).toBeLessThanOrEqual(f.max);
      expect(f.css).toMatch(/^var\(--font-[a-z-]+\)$/);
    }
  });
});
