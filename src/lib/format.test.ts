import { describe, expect, it } from "vitest";
import { deliveryWindow, formatDay } from "./format";

describe("delivery estimates", () => {
  it("count working days on the Indian calendar and never land on a Sunday", () => {
    // 03:30 on Wednesday 21 Oct in India is still Tuesday 20 Oct in UTC.
    const from = new Date("2026-10-20T22:00:00.000Z");
    const w = deliveryWindow(2, 4, from);
    expect(formatDay(w.from)).toBe("Fri, 23 Oct");
    expect(formatDay(w.to)).toBe("Mon, 26 Oct");
    for (let days = 1; days <= 10; days++) {
      expect(formatDay(deliveryWindow(days, days, from).to)).not.toMatch(/^Sun/);
    }
  });
});
