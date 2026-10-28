import { describe, expect, it } from "vitest";
import { isStoreType, optionNames, STORE_KINDS, STORE_TYPES, storeKind } from "./store-types";

describe("store types", () => {
  it("each have the words, options, details and sizes a store of that kind needs", () => {
    const labels = new Set<string>();
    for (const k of STORE_KINDS) {
      expect(k.key).toMatch(/^[a-z][a-z0-9-]{1,29}$/);
      labels.add(k.label);
      for (const word of [k.label, k.example, k.one, k.many, k.options.size, k.options.color, k.returnCondition, k.noReturns, k.faq.q, k.faq.a, ...Object.values(k.words)]) {
        expect(word.trim()).not.toBe("");
      }
      for (const [field, title] of [["material", "materialTitle"], ["fit", "fitTitle"]] as const) {
        expect(k.details[field].trim()).not.toBe("");
        expect(k.details[title].trim()).not.toBe("");
      }
      // Option names fit their database limit; starter departments fit the database's eight.
      expect(k.options.size.length).toBeLessThanOrEqual(30);
      expect(k.options.color.length).toBeLessThanOrEqual(30);
      expect(k.departments.length).toBeLessThanOrEqual(8);
      expect(new Set(k.departments.map((d) => d.toLowerCase())).size).toBe(k.departments.length);
      expect(k.sizeSets.length).toBeGreaterThan(0);
      for (const set of k.sizeSets) expect(set.sizes.every((s) => s.trim() && s.length <= 30)).toBe(true);
      // The starter text reads as a sentence: "{store} brings together {about}."
      expect(k.words.about).toMatch(/^[a-z]/);
    }
    expect(labels.size).toBe(STORE_TYPES.length);
  });

  it("keep a clothing store's words as they were, and treat anything unknown as clothing", () => {
    const fashion = storeKind("fashion");
    expect(fashion.words.favourites).toBe("Pieces we love");
    expect(fashion.words.browse).toBe("Find your fit");
    expect(fashion.words.newsletter).toBe("First to know, first to wear");
    expect(fashion.options).toEqual({ size: "Size", color: "Colour" });
    expect(fashion.details.materialTitle).toBe("Fabric & care");
    expect(storeKind(undefined).key).toBe("fashion");
    expect(storeKind("Pets!").key).toBe("fashion");
    expect(isStoreType("instruments")).toBe(true);
    expect(isStoreType("spaceships")).toBe(false);
  });

  it("speak each kind's language", () => {
    expect(storeKind("footwear").words.favourites).toBe("Pairs we love");
    expect(storeKind("pets").words.browse).toBe("Shop by pet");
    expect(storeKind("grocery").options).toEqual({ size: "Pack size", color: "Flavour" });
    expect(storeKind("instruments").details.material).toBe("Specifications");
    // Only things made of something share a material with search engines.
    expect(storeKind("fashion").details.madeOf).toBe(true);
    expect(storeKind("electronics").details.madeOf).toBe(false);
    // Clothes hang on a rail; everything else stands on a shelf.
    expect(STORE_KINDS.filter((k) => k.display === "hangers").map((k) => k.key)).toEqual(["fashion"]);
  });

  it("let a product name its own options, falling back to its store's", () => {
    const pets = storeKind("pets");
    expect(optionNames(pets)).toEqual({ size: "Size", color: "Variant" });
    expect(optionNames(pets, { size: "Pack size", color: "Flavour" })).toEqual({ size: "Pack size", color: "Flavour" });
    expect(optionNames(pets, { size: "  ", color: "" })).toEqual({ size: "Size", color: "Variant" });
    expect(optionNames(pets, { size: "x".repeat(40) }).size).toHaveLength(30);
    expect(optionNames(pets, ["Size"])).toEqual({ size: "Size", color: "Variant" });
    expect(optionNames(pets, { size: 42 })).toEqual({ size: "Size", color: "Variant" });
  });
});
