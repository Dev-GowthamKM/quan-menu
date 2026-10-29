import { describe, expect, it } from "vitest";
import { badgeSvg, shortName, type StoreBadge } from "./store-badge";

describe("store badge", () => {
  it("fits the store's name under a home-screen icon", () => {
    expect(shortName("Taana")).toBe("Taana");
    expect(shortName("  Kesar Studio  ")).toBe("Kesar Studio");
    expect(shortName("Paws and Whiskers Pet Supplies")).toBe("Paws");
    expect(shortName("Supercalifragilistic Shoes")).toBe("Supercalifra");
  });

  it("draws the initials safely in the store's shape", () => {
    const badge: StoreBadge = { letters: "<&", fill: "#6b1d2e", ink: "#fff", corners: "round", serif: false, italic: true, font: { family: "Archivo", weight: 800 } };
    const svg = badgeSvg(badge, 56);
    expect(svg).toContain("&lt;&amp;");
    expect(svg).toContain('<circle cx="32" cy="32" r="32" fill="#6b1d2e"/>');
    expect(svg).toContain('width="56" height="56"');
    expect(svg).toContain('font-style="italic"');
    expect(badgeSvg({ ...badge, corners: "soft" })).toContain('rx="14"');
  });
});
