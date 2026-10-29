import type { Tables } from "./types";

/** Whether a customer can see their order's invoice: once it's confirmed (cash on delivery) or paid. */
export function invoiceAvailable(o: Pick<Tables<"orders">, "status" | "payment_status">) {
  return o.status === "confirmed" || o.status === "completed" || ["paid", "partially_refunded", "refunded"].includes(o.payment_status);
}
