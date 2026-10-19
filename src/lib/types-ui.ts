// Display helpers for order, payment and fulfilment states (shared by store and admin).
import type { FulfillmentStatus, OrderStatus, PaymentStatus } from "./types";
export type { OrderDetail } from "./types";

export type Tone = "neutral" | "dark" | "green" | "amber" | "red" | "blue" | "violet" | "sale";

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: Tone }> = {
  pending_payment: { label: "Awaiting payment", tone: "amber" },
  confirmed: { label: "Confirmed", tone: "blue" },
  completed: { label: "Completed", tone: "green" },
  cancelled: { label: "Cancelled", tone: "red" },
};

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: Tone }> = {
  pending: { label: "Payment pending", tone: "amber" },
  unpaid: { label: "Pay on delivery", tone: "neutral" },
  paid: { label: "Paid", tone: "green" },
  partially_refunded: { label: "Partially refunded", tone: "violet" },
  refunded: { label: "Refunded", tone: "violet" },
  failed: { label: "Payment failed", tone: "red" },
  voided: { label: "Not charged", tone: "neutral" },
};

export const FULFILLMENT_STATUS: Record<FulfillmentStatus, { label: string; tone: Tone }> = {
  unfulfilled: { label: "Not yet packed", tone: "neutral" },
  processing: { label: "Preparing", tone: "blue" },
  packed: { label: "Packed", tone: "blue" },
  shipped: { label: "Shipped", tone: "violet" },
  delivered: { label: "Delivered", tone: "green" },
  returned: { label: "Returned", tone: "red" },
};
