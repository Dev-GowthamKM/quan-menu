import { describe, expect, it } from "vitest";
import { safeHref } from "./urls";

describe("safeHref", () => {
  it("keeps site paths and web addresses", () => {
    expect(safeHref("/collections/autumn")).toBe("/collections/autumn");
    expect(safeHref("https://instagram.com/store")).toBe("https://instagram.com/store");
  });
  it("drops anything that could run script or leave the site unexpectedly", () => {
    for (const bad of ["javascript:alert(1)", " JavaScript:alert(1)", "data:text/html,<script>", "//evil.example", "vbscript:x", "", null]) {
      expect(safeHref(bad)).toBeNull();
    }
  });
});
