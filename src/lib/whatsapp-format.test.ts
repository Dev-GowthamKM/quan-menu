import { describe, expect, it } from "vitest";
import { cleanParam, templateParams, waNumber } from "./whatsapp-format";

describe("WhatsApp numbers", () => {
  it("turns Indian mobile numbers into the international form", () => {
    expect(waNumber("+91 98450 12345")).toBe("919845012345");
    expect(waNumber("098450 12345")).toBe("919845012345");
    expect(waNumber("9845012345")).toBe("919845012345");
    expect(waNumber("91-98450-12345")).toBe("919845012345");
  });

  it("refuses numbers that can't be mobiles, keeps other countries' numbers given with +", () => {
    expect(waNumber("0512 234 567")).toBeNull();
    expect(waNumber("5123456789")).toBeNull();
    expect(waNumber("12345")).toBeNull();
    expect(waNumber("+44 7700 900123")).toBe("447700900123");
  });
});

describe("template values", () => {
  const v = {
    firstName: "Meera", orderNumber: "TA100001", orderTotal: "₹5,841", orderLink: "https://taana.example/orders/TA100001?key=k",
    carrier: "Delhivery", trackingNumber: "DL123", trackingLink: "", refundAmount: "₹649", returnStatus: "approved",
  };

  it("fills each template in its documented order", () => {
    expect(templateParams("order_confirmation", v)).toEqual(["Meera", "TA100001", "₹5,841", v.orderLink]);
    expect(templateParams("order_shipped", v)).toEqual(["Meera", "TA100001", "Delhivery", "DL123", v.orderLink]);
    expect(templateParams("refund_processed", v)).toEqual(["Meera", "₹649", "TA100001"]);
  });

  it("keeps values to what WhatsApp accepts", () => {
    expect(cleanParam("Line one\n\n\tline     two ")).toBe("Line one line two");
    expect(cleanParam("")).toBe("-");
  });
});
