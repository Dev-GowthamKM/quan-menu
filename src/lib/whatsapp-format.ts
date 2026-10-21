// WhatsApp message definitions shared by the sender and the settings page: which store
// events can go out on WhatsApp, the values each template receives (in order), and a
// suggested template text to submit for approval in WhatsApp Manager.

export const WHATSAPP_EVENTS = [
  {
    key: "order_confirmation",
    label: "Order confirmed",
    params: ["first name", "order number", "order total", "order link"],
    sample: "Hi {{1}}, thank you for your order! Order {{2}} for {{3}} is confirmed and we'll message you when it ships.\n\nView your order: {{4}}\n\nThank you for shopping with us.",
  },
  {
    key: "cod_confirm",
    label: "Confirm cash order",
    params: ["first name", "order number", "order total", "order link"],
    sample: "Hi {{1}}, thank you for your order {{2}} for {{3}}, to be paid in cash on delivery. Please confirm it so we can start packing:\n\n{{4}}\n\nUnconfirmed orders are cancelled automatically.",
  },
  {
    key: "order_shipped",
    label: "Shipped",
    params: ["first name", "order number", "courier", "tracking number", "tracking link"],
    sample: "Hi {{1}}, your order {{2}} has shipped with {{3}} (tracking number {{4}}).\n\nTrack it here: {{5}}\n\nThank you for shopping with us.",
  },
  {
    key: "order_delivered",
    label: "Delivered",
    params: ["first name", "order number", "order link"],
    sample: "Hi {{1}}, your order {{2}} has been delivered. We hope you love it!\n\nNeed help or a return? {{3}}\n\nThank you.",
  },
  {
    key: "order_cancelled",
    label: "Cancelled",
    params: ["first name", "order number", "order link"],
    sample: "Hi {{1}}, your order {{2}} has been cancelled. Any refund due is shown on your order page: {{3}}\n\nSorry for the trouble.",
  },
  {
    key: "refund_processed",
    label: "Refunded",
    params: ["first name", "refund amount", "order number"],
    sample: "Hi {{1}}, we have refunded {{2}} for your order {{3}}. Banks usually take 5-7 working days to show it.\n\nThank you.",
  },
  {
    key: "return_update",
    label: "Return update",
    params: ["first name", "order number", "return status", "order link"],
    sample: "Hi {{1}}, your return for order {{2}} is now: {{3}}.\n\nDetails: {{4}}\n\nThank you.",
  },
] as const;

export type WhatsAppEvent = (typeof WHATSAPP_EVENTS)[number]["key"];

export interface TemplateSetting {
  name: string;
  language: string;
}

/**
 * An Indian mobile number in the international form WhatsApp expects (country code, no
 * plus): "+91 98450 12345", "098450 12345" and "9845012345" all become "919845012345".
 * Returns null when it can't be a mobile number.
 */
export function waNumber(phone: string): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  let n = digits;
  if (n.length === 11 && n.startsWith("0")) n = n.slice(1);
  if (n.length === 10) n = `91${n}`;
  if (/^91[6-9]\d{9}$/.test(n)) return n;
  // Numbers from other countries, already with their country code.
  if (String(phone).trim().startsWith("+") && digits.length >= 8 && digits.length <= 15 && !digits.startsWith("91")) return digits;
  return null;
}

/** Template values can't contain new lines, tabs or long runs of spaces, and are capped in length. */
export function cleanParam(text: string) {
  return String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 500) || "-";
}

export interface MessageValues {
  firstName: string;
  orderNumber: string;
  orderTotal: string;
  orderLink: string;
  carrier: string;
  trackingNumber: string;
  trackingLink: string;
  refundAmount: string;
  returnStatus: string;
}

/** The template's values, in the order listed in WHATSAPP_EVENTS. */
export function templateParams(event: WhatsAppEvent, v: MessageValues): string[] {
  const values: Record<WhatsAppEvent, string[]> = {
    order_confirmation: [v.firstName, v.orderNumber, v.orderTotal, v.orderLink],
    cod_confirm: [v.firstName, v.orderNumber, v.orderTotal, v.orderLink],
    order_shipped: [v.firstName, v.orderNumber, v.carrier || "our courier", v.trackingNumber || "on your order page", v.trackingLink || v.orderLink],
    order_delivered: [v.firstName, v.orderNumber, v.orderLink],
    order_cancelled: [v.firstName, v.orderNumber, v.orderLink],
    refund_processed: [v.firstName, v.refundAmount, v.orderNumber],
    return_update: [v.firstName, v.orderNumber, v.returnStatus, v.orderLink],
  };
  return values[event].map(cleanParam);
}

export const isWhatsAppEvent = (key: string): key is WhatsAppEvent => WHATSAPP_EVENTS.some((e) => e.key === key);
