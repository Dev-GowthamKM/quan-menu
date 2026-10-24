import "server-only";
import { SHIPROCKET_API_BASE, SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD } from "../server-env";
import { parseShiprocketDate } from "./tracking";

// Minimal Shiprocket client (https://apidocs.shiprocket.in). Shiprocket books the courier
// (Delhivery, Blue Dart, Xpressbees, DTDC...), prints the label and schedules the pickup;
// tracking updates come back through the webhook in /api/webhooks/courier.

const connected = () => !!(SHIPROCKET_EMAIL && SHIPROCKET_PASSWORD);

/** Whether a store can book Shiprocket: the account is the platform's own, so the home store only (for now). */
export const shiprocketConfigured = (store: { isHome: boolean }) => store.isHome && connected();

/** Public tracking page for an AWB. */
export const shiprocketTrackingUrl = (awb: string) => `https://shiprocket.co/tracking/${encodeURIComponent(awb)}`;

export class ShiprocketError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// Shiprocket tokens last 10 days; keep one per server instance and renew it a day early.
let session: { token: string; expires: number } | null = null;

async function login(): Promise<string> {
  if (session && session.expires > Date.now()) return session.token;
  if (!connected()) throw new ShiprocketError("Shiprocket isn't connected. Set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD.", 0);
  const res = await fetch(`${SHIPROCKET_API_BASE}/v1/external/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: SHIPROCKET_EMAIL, password: SHIPROCKET_PASSWORD }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { token?: string; message?: string };
  if (!res.ok || !body.token) throw new ShiprocketError(body.message || `Shiprocket sign-in failed (${res.status}). Check the API user's email and password.`, res.status);
  session = { token: body.token, expires: Date.now() + 9 * 24 * 3600_000 };
  return body.token;
}

function messageOf(body: unknown, status: number) {
  const b = body as { message?: unknown; errors?: Record<string, unknown> } | null;
  if (b?.errors && typeof b.errors === "object") {
    const first = Object.values(b.errors).flat()[0];
    if (first) return String(first);
  }
  if (typeof b?.message === "string" && b.message) return b.message;
  return `Shiprocket returned an error (${status}).`;
}

async function api<T>(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}, retry = true): Promise<T> {
  const token = await login();
  const res = await fetch(`${SHIPROCKET_API_BASE}/v1/external${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(init.timeoutMs ?? 20_000),
  });
  if (res.status === 401 && retry) {
    session = null;
    return api<T>(path, init, false);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ShiprocketError(messageOf(body, res.status), res.status);
  return body as T;
}

/** Signs in with the configured API user; used by the "Test connection" button. */
export async function testConnection() {
  session = null;
  await login();
}

export interface CourierOption {
  id: number;
  name: string;
  /** Total charge in rupees (Shiprocket quotes rupees, not paise). */
  rate: number;
  etd: string;
  days: number | null;
  cod: boolean;
  rating: number | null;
}

interface ServiceabilityResponse {
  status?: number;
  message?: string;
  data?: {
    available_courier_companies?: {
      courier_company_id: number; courier_name: string; rate: number | string; etd?: string;
      estimated_delivery_days?: number | string; cod?: number | boolean; rating?: number | string;
    }[];
    recommended_courier_company_id?: number;
    shiprocket_recommended_courier_id?: number;
  };
}

/** Couriers that can carry a parcel between two PIN codes, with price and delivery estimate. */
export async function serviceability(input: { pickup: string; delivery: string; weightKg: number; cod: boolean; declaredValue?: number; timeoutMs?: number }) {
  const q = new URLSearchParams({
    pickup_postcode: input.pickup,
    delivery_postcode: input.delivery,
    weight: String(Math.max(input.weightKg, 0.1)),
    cod: input.cod ? "1" : "0",
  });
  if (input.declaredValue) q.set("declared_value", String(Math.round(input.declaredValue)));
  const res = await api<ServiceabilityResponse>(`/courier/serviceability/?${q}`, { timeoutMs: input.timeoutMs });
  const list = res.data?.available_courier_companies ?? [];
  const couriers: CourierOption[] = list.map((c) => {
    const days = Number(c.estimated_delivery_days);
    const rating = Number(c.rating);
    return {
      id: Number(c.courier_company_id),
      name: String(c.courier_name),
      rate: Number(c.rate) || 0,
      etd: String(c.etd ?? ""),
      days: Number.isFinite(days) && days > 0 ? days : null,
      cod: c.cod === 1 || c.cod === true,
      rating: Number.isFinite(rating) && rating > 0 ? rating : null,
    };
  });
  const recommendedId = res.data?.recommended_courier_company_id ?? res.data?.shiprocket_recommended_courier_id ?? null;
  return { couriers, recommendedId };
}

export interface ShiprocketOrderInput {
  order_id: string;
  order_date: string;
  pickup_location: string;
  billing_customer_name: string;
  billing_last_name: string;
  billing_address: string;
  billing_address_2: string;
  billing_city: string;
  billing_pincode: string;
  billing_state: string;
  billing_country: string;
  billing_email: string;
  billing_phone: string;
  shipping_is_billing: boolean;
  order_items: { name: string; sku: string; units: number; selling_price: number; discount: number; tax: number }[];
  payment_method: "Prepaid" | "COD";
  shipping_charges: number;
  /** Cash-on-delivery fee, so the courier collects the order total. */
  transaction_charges: number;
  total_discount: number;
  sub_total: number;
  length: number;
  breadth: number;
  height: number;
  weight: number;
}

/** Creates the order in Shiprocket. Returns Shiprocket's order and shipment ids. */
export async function createOrder(input: ShiprocketOrderInput) {
  const res = await api<{ order_id?: number; shipment_id?: number; status?: string; message?: string }>("/orders/create/adhoc", { method: "POST", body: input });
  if (!res.order_id || !res.shipment_id) throw new ShiprocketError(res.message || "Shiprocket didn't create the order.", 422);
  return { orderId: String(res.order_id), shipmentId: String(res.shipment_id) };
}

/** Assigns an AWB (tracking number) with the chosen courier, or Shiprocket's pick when none is given. */
export async function assignAwb(shipmentId: string, courierId?: number) {
  const res = await api<{
    awb_assign_status?: number;
    message?: string;
    response?: { data?: { awb_code?: string; courier_name?: string; courier_company_id?: number; awb_assign_error?: string } };
  }>("/courier/assign/awb", { method: "POST", body: { shipment_id: Number(shipmentId), ...(courierId ? { courier_id: courierId } : {}) } });
  const data = res.response?.data;
  if (res.awb_assign_status !== 1 || !data?.awb_code) {
    throw new ShiprocketError(data?.awb_assign_error || res.message || "Shiprocket couldn't assign a courier. Check your Shiprocket wallet balance and the pickup address.", 422);
  }
  return { awb: String(data.awb_code), courier: String(data.courier_name ?? ""), courierId: data.courier_company_id ?? null };
}

/** Asks the courier to collect the parcel. Returns the scheduled pickup time when given. */
export async function schedulePickup(shipmentId: string) {
  const res = await api<{ pickup_status?: number; message?: string; response?: { pickup_scheduled_date?: string } }>(
    "/courier/generate/pickup",
    { method: "POST", body: { shipment_id: [Number(shipmentId)] } },
  );
  if (res.pickup_status !== 1) throw new ShiprocketError(res.message || "Shiprocket couldn't schedule the pickup.", 422);
  return { pickupAt: parseShiprocketDate(res.response?.pickup_scheduled_date) };
}

/** A fresh link to the shipping label PDF. */
export async function labelUrl(shipmentId: string) {
  const res = await api<{ label_created?: number; label_url?: string; response?: string }>("/courier/generate/label", {
    method: "POST",
    body: { shipment_id: [Number(shipmentId)] },
  });
  if (!res.label_url) throw new ShiprocketError(typeof res.response === "string" ? res.response : "Shiprocket couldn't create the label.", 422);
  return res.label_url;
}

export async function cancelOrder(orderId: string) {
  await api("/orders/cancel", { method: "POST", body: { ids: [Number(orderId)] } });
}

export interface TrackingSnapshot {
  status: string;
  statusId: number | null;
  activities: { date: string; activity: string; location: string; srStatus: string; srLabel: string }[];
  etd: string;
}

/** The latest tracking for an AWB (used when staff refresh tracking by hand). */
export async function track(awb: string): Promise<TrackingSnapshot> {
  const res = await api<{
    tracking_data?: {
      shipment_status?: number;
      shipment_track?: { current_status?: string }[];
      shipment_track_activities?: { date?: string; activity?: string; location?: string; "sr-status"?: string | number; "sr-status-label"?: string }[] | null;
      etd?: string;
    };
  }>(`/courier/track/awb/${encodeURIComponent(awb)}`);
  const t = res.tracking_data ?? {};
  return {
    status: String(t.shipment_track?.[0]?.current_status ?? ""),
    statusId: typeof t.shipment_status === "number" ? t.shipment_status : null,
    activities: (t.shipment_track_activities ?? []).map((a) => ({
      date: String(a.date ?? ""),
      activity: String(a.activity ?? ""),
      location: String(a.location ?? ""),
      srStatus: String(a["sr-status"] ?? ""),
      srLabel: String(a["sr-status-label"] ?? ""),
    })),
    etd: String(t.etd ?? ""),
  };
}
