// Turns a courier tracking update into the store's own statuses. Pure functions, so the
// mapping can be unit tested; the webhook route and "Refresh tracking" both use them.

export type CourierStatus =
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "undelivered"
  | "rto_initiated"
  | "rto_delivered"
  | "cancelled"
  | "exception"
  | "other";

const normal = (s: string) => s.toUpperCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

const BY_LABEL: Record<string, CourierStatus> = {
  "DELIVERED": "delivered",
  "RTO DELIVERED": "rto_delivered",
  "OUT FOR DELIVERY": "out_for_delivery",
  "PICKED UP": "in_transit",
  "SHIPPED": "in_transit",
  "IN TRANSIT": "in_transit",
  "REACHED AT DESTINATION HUB": "in_transit",
  "REACHED DESTINATION HUB": "in_transit",
  "IN FLIGHT": "in_transit",
  "HANDOVER TO COURIER": "in_transit",
  "MISROUTED": "in_transit",
  "DELAYED": "in_transit",
  "IN TRANSIT OVERSEAS": "in_transit",
  "UNDELIVERED": "undelivered",
  "ISSUE RELATED TO THE RECIPIENT": "undelivered",
  "RTO INITIATED": "rto_initiated",
  "RTO ACKNOWLEDGED": "rto_initiated",
  "RTO IN TRANSIT": "rto_initiated",
  "RTO OFD": "rto_initiated",
  "RTO NDR": "rto_initiated",
  "RTO LOCK": "rto_initiated",
  "REACHED BACK AT SELLER CITY": "rto_initiated",
  "CANCELED": "cancelled",
  "CANCELLED": "cancelled",
  "CANCELLED BEFORE DISPATCHED": "cancelled",
  "LOST": "exception",
  "DAMAGED": "exception",
  "DESTROYED": "exception",
  "UNTRACEABLE": "exception",
  "DISPOSED OFF": "exception",
  "PICKUP EXCEPTION": "exception",
  "PICKUP ERROR": "exception",
  "PARTIAL DELIVERED": "exception",
};

// Shiprocket's numeric shipment status ids, for updates whose text we don't recognise.
const BY_ID: Record<number, CourierStatus> = {
  6: "in_transit", 7: "delivered", 8: "cancelled", 9: "rto_initiated", 10: "rto_delivered", 12: "exception",
  13: "exception", 14: "rto_initiated", 17: "out_for_delivery", 18: "in_transit", 20: "exception", 21: "undelivered",
  22: "in_transit", 24: "exception", 25: "exception", 38: "in_transit", 39: "in_transit", 40: "rto_initiated",
  41: "rto_initiated", 42: "in_transit", 45: "cancelled", 46: "rto_initiated",
};

export function normalizeShiprocketStatus(label: string, id?: number | null): CourierStatus {
  const byLabel = BY_LABEL[normal(label)];
  if (byLabel) return byLabel;
  return (id != null && BY_ID[id]) || "other";
}

/** "OUT_FOR_DELIVERY" → "Out for delivery", keeping courier acronyms. */
export function prettyStatus(label: string) {
  const s = normal(label).toLowerCase();
  if (!s) return "";
  return (s[0].toUpperCase() + s.slice(1)).replace(/\b(rto|ndr|ofd|qc|awb)\b/gi, (w) => w.toUpperCase());
}

export interface CourierUpdate {
  awb: string;
  status: CourierStatus;
  label: string;
  location: string;
  /** ISO time of the update, when the courier gave one. */
  at: string | null;
  /** Expected delivery date (YYYY-MM-DD), when given. */
  etd: string | null;
  /** Identifies this update so a repeated delivery is applied once. */
  key: string;
}


/** The calendar date in India for an ISO time. */
export const istDate = (iso: string) => new Date(Date.parse(iso) + 5.5 * 3600_000).toISOString().slice(0, 10);

interface ShiprocketWebhook {
  awb?: string | number;
  current_status?: string;
  current_status_id?: number;
  shipment_status?: string;
  shipment_status_id?: number;
  current_timestamp?: string;
  etd?: string;
  is_return?: number | string;
  scans?: { date?: string; activity?: string; location?: string; "sr-status-label"?: string }[];
}

/**
 * Reads a Shiprocket tracking webhook. Returns null for payloads without an AWB and for
 * return (reverse pickup) shipments, which the store doesn't book through Shiprocket.
 */
export function parseShiprocketWebhook(body: unknown): CourierUpdate | null {
  const b = (body ?? {}) as ShiprocketWebhook;
  const awb = String(b.awb ?? "").trim();
  if (!awb || String(b.is_return ?? "0") === "1") return null;
  const raw = String(b.shipment_status || b.current_status || "").trim();
  const id = typeof b.shipment_status_id === "number" ? b.shipment_status_id : typeof b.current_status_id === "number" ? b.current_status_id : null;
  const scans = (Array.isArray(b.scans) ? b.scans : [])
    .map((s) => ({ ...s, iso: parseShiprocketDate(s.date) }))
    .filter((s) => s.iso)
    .sort((x, y) => (x.iso! < y.iso! ? -1 : 1));
  const last = scans[scans.length - 1];
  const at = parseShiprocketDate(b.current_timestamp) ?? last?.iso ?? null;
  const etdIso = parseShiprocketDate(b.etd);
  return {
    awb,
    status: normalizeShiprocketStatus(raw, id),
    label: prettyStatus(raw) || prettyStatus(last?.["sr-status-label"] ?? "") || "Update from the courier",
    location: String(last?.location ?? "").trim().slice(0, 120),
    at,
    etd: etdIso ? istDate(etdIso) : null,
    key: `${awb}|${id ?? normal(raw)}|${String(b.current_timestamp ?? at ?? "")}`,
  };
}

/**
 * Shiprocket sends times in India time without a zone, as "2026-10-21 14:05:00" or
 * "21 10 2026 14:05:00". Returns an ISO string, or null.
 */
export function parseShiprocketDate(value: unknown): string | null {
  const s = String(value ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  let parts: string[] | null = m ? [m[1], m[2], m[3], m[4] ?? "00", m[5] ?? "00", m[6] ?? "00"] : null;
  if (!parts) {
    m = s.match(/^(\d{2})[ -](\d{2})[ -](\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) parts = [m[3], m[2], m[1], m[4] ?? "00", m[5] ?? "00", m[6] ?? "00"];
  }
  if (!parts) {
    const t = Date.parse(s);
    return Number.isNaN(t) || !s ? null : new Date(t).toISOString();
  }
  const d = new Date(`${parts[0]}-${parts[1]}-${parts[2]}T${parts[3]}:${parts[4]}:${parts[5]}+05:30`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
