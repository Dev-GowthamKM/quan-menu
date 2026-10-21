import { describe, expect, it } from "vitest";
import { formatIndianMobile, indianMobile, maskMobile } from "./phone";

describe("Indian mobile numbers", () => {
  it("accept the ways shoppers type them", () => {
    for (const typed of ["9845012345", "+91 98450 12345", "+919845012345", "919845012345", "098450-12345", "(+91) 98450.12345", "6000000000"]) {
      expect(indianMobile(typed), typed).toMatch(/^91[6-9]\d{9}$/);
    }
    expect(indianMobile("+91 98450 12345")).toBe("919845012345");
  });

  it("refuse landlines, short numbers, letters and other countries", () => {
    for (const typed of ["", "022 2345 678", "011-2345678", "5845012345", "98450 1234", "98450123456", "+1 415 555 0100", "+44 7700 900123", "98450abcde", null, undefined]) {
      expect(indianMobile(typed as string), String(typed)).toBeNull();
    }
  });

  it("format and mask for display and logs", () => {
    expect(formatIndianMobile("919845012345")).toBe("+91 98450 12345");
    expect(formatIndianMobile("not a number")).toBe("not a number");
    expect(maskMobile("+91 98450 12345")).toBe("+91 98•••••345");
  });
});
