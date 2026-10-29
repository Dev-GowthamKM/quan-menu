import { describe, expect, it } from "vitest";
import { invoiceAvailable } from "./invoice";

describe("invoices", () => {
  it("are there once an order is confirmed or paid", () => {
    expect(invoiceAvailable({ status: "confirmed", payment_status: "unpaid" })).toBe(true);
    expect(invoiceAvailable({ status: "completed", payment_status: "paid" })).toBe(true);
    expect(invoiceAvailable({ status: "cancelled", payment_status: "refunded" })).toBe(true);
  });

  it("aren't there for an order still waiting for payment, or cancelled before it was paid", () => {
    expect(invoiceAvailable({ status: "pending_payment", payment_status: "pending" })).toBe(false);
    expect(invoiceAvailable({ status: "cancelled", payment_status: "voided" })).toBe(false);
    expect(invoiceAvailable({ status: "cancelled", payment_status: "unpaid" })).toBe(false);
  });
});
