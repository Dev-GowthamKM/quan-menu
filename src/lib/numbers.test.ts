import { describe, expect, it } from "vitest";
import { countTo } from "./numbers";

describe("counting up a figure", () => {
  it("ends on the figure exactly as written", () => {
    for (const v of ["12,000+", "₹2,999", "4.8★", "15", "1,20,000 customers", "48 h"]) expect(countTo(v, 1)).toBe(v);
  });

  it("keeps its prefix, suffix, decimals and grouping on the way", () => {
    expect(countTo("12,000+", 0)).toBe("0+");
    expect(countTo("12,000+", 0.5)).toBe("6,000+");
    expect(countTo("₹2,999", 0.5)).toBe("₹1,500");
    expect(countTo("4.8★", 0.5)).toBe("2.4★");
    expect(countTo("1,20,000", 0.5)).toBe("60,000");
    expect(countTo("15 days", 0.2)).toBe("3 days");
  });

  it("leaves words that aren't figures alone", () => {
    expect(countTo("Handmade", 0.3)).toBe("Handmade");
    expect(countTo("", 0.3)).toBe("");
  });
});
