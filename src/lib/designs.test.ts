import { describe, expect, it } from "vitest";
import {
  DESIGN_KEYS,
  DESIGN_LIST,
  DESIGNS,
  designLook,
  freshLook,
  headingWeight,
  homeSections,
  lookOfSettings,
  monogram,
  parseOptions,
  radiusTokens,
  resolveDesign,
  SECTION_KEYS,
  type TakenLook,
} from "./designs";
import { BODY_FONTS, HEADING_FONTS, paletteByKey, PALETTES } from "./theme";

/** A repeatable stand-in for Math.random. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const taken = (design: string, palette: string, heading = "cormorant"): TakenLook => {
  const p = paletteByKey(palette)!;
  return { design, brand: p.colors.brand, background: p.colors.background, heading_font: heading };
};

describe("designs", () => {
  it("each suggest palettes and fonts that exist, and sections the home page has", () => {
    for (const d of DESIGN_LIST) {
      expect(d.palettes.length).toBeGreaterThan(2);
      for (const p of d.palettes) expect(paletteByKey(p), `${d.key}: ${p}`).toBeDefined();
      for (const f of d.headings) expect(HEADING_FONTS[f], `${d.key}: ${f}`).toBeDefined();
      for (const f of d.bodies) expect(BODY_FONTS[f], `${d.key}: ${f}`).toBeDefined();
      for (const s of d.sections) expect(SECTION_KEYS).toContain(s);
      expect(new Set(d.sections).size).toBe(d.sections.length);
      expect(d.sections[0]).toBe("hero");
    }
  });

  it("are built differently from one another", () => {
    const parts = (k: (typeof DESIGN_KEYS)[number]) => {
      const d = DESIGNS[k];
      return [d.header, d.hero, d.card, d.departments, d.title, d.footer];
    };
    for (const a of DESIGN_KEYS) {
      for (const b of DESIGN_KEYS) {
        if (a === b) continue;
        // Every part differs between any two designs: no two look alike.
        parts(a).forEach((part, i) => expect(part, `${a} vs ${b}`).not.toBe(parts(b)[i]));
      }
    }
  });

  it("every palette is suggested by some design", () => {
    const suggested = new Set(DESIGN_LIST.flatMap((d) => d.palettes));
    for (const p of PALETTES) expect(suggested.has(p.key), p.key).toBe(true);
  });

  it("falls back to Atelier for an unknown design, and applies only valid mixed-in parts", () => {
    expect(resolveDesign("nonsense").key).toBe("atelier");
    expect(resolveDesign(undefined).header).toBe("classic");
    const mixed = resolveDesign("nordic", { card: "sticker", corners: "round", header: "not-a-header", extra: "x" });
    expect(mixed.key).toBe("nordic");
    expect(mixed.card).toBe("sticker");
    expect(mixed.corners).toBe("round");
    expect(mixed.header).toBe("inline");
    expect(parseOptions(["card"])).toEqual({});
    expect(parseOptions(null)).toEqual({});
    expect(parseOptions({ buttons: "pill", hero: 3 })).toEqual({ buttons: "pill" });
  });

  it("move as the design says, unless the store picks otherwise", () => {
    expect(DESIGNS.atelier.motion).toBe("none");
    expect(DESIGNS.nordic.motion).toBe("subtle");
    expect(DESIGNS.cinema.motion).toBe("cinematic");
    expect(resolveDesign("cinema", { motion: "none" }).motion).toBe("none");
    expect(resolveDesign("atelier", { motion: "subtle" }).motion).toBe("subtle");
    expect(resolveDesign("atelier", { motion: "warp" }).motion).toBe("none");
    // The scrolling sections belong to the cinematic designs, and Neon shows its pieces one at a time.
    for (const k of ["cinema", "neon"] as const) expect(DESIGNS[k].sections).toEqual(expect.arrayContaining(["spotlight", "statement"]));
    expect(DESIGNS.neon.sections).toContain("showcase");
    // The reel's sections: Neon hangs its pieces on a rail between moving bands and counts its figures; Cinema walks an aisle.
    expect(DESIGNS.neon.sections).toEqual(expect.arrayContaining(["rack", "marquee", "numbers"]));
    expect(DESIGNS.cinema.sections).toEqual(expect.arrayContaining(["aisle", "numbers"]));
    expect(DESIGNS.atelier.sections).not.toContain("aisle");
  });

  it("open with the store's name only where they move, and only if the store wants it", () => {
    for (const d of DESIGN_LIST) expect(d.intro === "name").toBe(d.motion === "cinematic");
    expect(resolveDesign("neon", { intro: "none" }).intro).toBe("none");
    expect(resolveDesign("atelier", { intro: "name" }).intro).toBe("name");
    expect(parseOptions({ intro: "fireworks" })).toEqual({});
  });

  it("turns corners and buttons into radius tokens", () => {
    expect(radiusTokens({ corners: "sharp", buttons: "square" })).toMatchObject({ "--radius-card": "0px", "--radius-btn": "0px" });
    expect(radiusTokens({ corners: "round", buttons: "pill" })).toMatchObject({ "--radius-card": "20px", "--radius-btn": "999px", "--radius-badge": "999px" });
  });

  it("sets headings in a weight the font has", () => {
    expect(headingWeight({ headingWeight: 800 }, "tenor")).toBe(400);
    expect(headingWeight({ headingWeight: 800 }, "unbounded")).toBe(800);
    expect(headingWeight({}, "cormorant")).toBe(HEADING_FONTS.cormorant.weight);
  });
});

describe("looks", () => {
  it("a design's own look uses its first palette and fonts, upright where the font has no italic", () => {
    const look = designLook("heritage");
    expect(look.colors).toEqual(paletteByKey("maharani")!.colors);
    expect(look.heading_font).toBe("cinzel");
    expect(look.heading_italic).toBe(false);
    expect(designLook("boutique").heading_italic).toBe(true);
  });

  it("reads a saved look, with sensible defaults before the design update", () => {
    const colors = PALETTES[0].colors;
    expect(lookOfSettings({ heading_font: "cormorant", body_font: "jost" }, colors, true)).toEqual({
      design: "atelier", colors, heading_font: "cormorant", body_font: "jost", heading_italic: true, options: {},
    });
    const odd = lookOfSettings({ design: "bazaar", design_options: { card: "framed" }, heading_font: "gone", body_font: "gone" }, colors, true);
    expect(odd).toMatchObject({ design: "bazaar", heading_font: "cormorant", body_font: "jost", options: { card: "framed" } });
  });

  it("a fresh look picks the design fewest stores use, and a palette none of them has", () => {
    const others = [
      taken("atelier", "wine"), taken("nordic", "snow"), taken("bazaar", "tangerine"), taken("boutique", "blush"),
      taken("noir", "onyx"), taken("cinema", "linen"), taken("neon", "ultraviolet"),
    ];
    for (let seed = 1; seed < 20; seed++) {
      const look = freshLook(others, seeded(seed));
      expect(look.design).toBe("heritage");
      expect(DESIGNS.heritage.palettes.map((k) => paletteByKey(k)!.colors.brand)).toContain(look.colors.brand);
    }
    const nordic = freshLook([...others, taken("heritage", "maharani"), taken("nordic", "oat")], seeded(3), { design: "nordic" });
    expect(["fog", "sage", "clay"].map((k) => paletteByKey(k)!.colors.brand)).toContain(nordic.colors.brand);
  });

  it("gives every store a different look until the designs and palettes run out", () => {
    const stores: TakenLook[] = [];
    const seen = new Set<string>();
    const total = DESIGN_LIST.reduce((n, d) => n + d.palettes.length, 0);
    const random = seeded(7);
    for (let i = 0; i < total; i++) {
      const look = freshLook(stores, random);
      const key = `${look.design}|${look.colors.brand}|${look.colors.background}`;
      expect(seen.has(key), `store ${i + 1}: ${key}`).toBe(false);
      seen.add(key);
      stores.push({ design: look.design, brand: look.colors.brand, background: look.colors.background, heading_font: look.heading_font });
    }
  });

  it("shuffling shows something new", () => {
    let look = freshLook([], seeded(11));
    for (let i = 0; i < 10; i++) {
      const next = freshLook([], seeded(100 + i), { avoid: look });
      expect(next.design).not.toBe(look.design);
      look = next;
    }
  });
});

describe("home page sections", () => {
  it("follow the design until the store arranges its own", () => {
    expect(homeSections(DESIGNS.bazaar, undefined)).toEqual(DESIGNS.bazaar.sections);
    expect(homeSections(DESIGNS.bazaar, [])).toEqual(DESIGNS.bazaar.sections);
    const own = homeSections(DESIGNS.atelier, [
      { key: "new", on: true },
      { key: "hero", on: true },
      { key: "brands", on: false },
      { key: "new", on: true },
      { key: "made-up", on: true },
      { key: "story", on: true },
    ]);
    expect(own).toEqual(["new", "hero", "story"]);
  });
});

describe("monogram", () => {
  it("takes a store's initials", () => {
    expect(monogram("Kesar Studio")).toBe("KS");
    expect(monogram("taana")).toBe("T");
    expect(monogram("Quán Ăn Ngon")).toBe("QA");
    expect(monogram("  ")).toBe("S");
  });
});
