"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AccessError, requireRole } from "@/lib/auth";
import { processOutbox } from "@/lib/email";
import { fail, friendlyError, ok, type ActionResult } from "@/lib/errors";
import { packageDefaultsOf } from "@/lib/settings";
import * as shiprocket from "@/lib/shipping/shiprocket";
import { normalizeShiprocketStatus, parseShiprocketDate, prettyStatus } from "@/lib/shipping/tracking";
import { supabaseService } from "@/lib/supabase/admin";
import type { AppRole, StoreSettings, Tables } from "@/lib/types";

// Courier bookings through Shiprocket, for staff. Shiprocket is called with the server's
// API user; every result is recorded through database functions that check the staff
// role and the order's state, so a booking can't skip payment or go backwards.

async function role(needed: AppRole) {
  try {
    return await requireRole(needed);
  } catch (e) {
    if (e instanceof AccessError) return null;
    throw e;
  }
}

type Ctx = NonNullable<Awaited<ReturnType<typeof role>>>;

function refresh(orderNumber: string) {
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderNumber}`);
  revalidatePath("/admin");
}

const uuid = z.string().uuid();

function problem(e: unknown, fallback: string) {
  if (e instanceof shiprocket.ShiprocketError) return `Shiprocket: ${e.message}`;
  console.error("[courier]", (e as Error)?.message);
  return fallback;
}

async function loadSettings(ctx: Ctx) {
  const { data } = await ctx.supabase.from("store_settings").select("*").eq("id", 1).single();
  return data as StoreSettings | null;
}

function ready(s: StoreSettings | null): string | null {
  if (!shiprocket.shiprocketConfigured()) return "Shiprocket isn't connected. Set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD on the server.";
  if (!s?.shiprocket_enabled) return "Turn on Shiprocket in Shipping › Courier connection first.";
  return null;
}

interface Address { full_name?: string; phone?: string; line1?: string; line2?: string; landmark?: string; city?: string; state?: string; postal_code?: string; country?: string }

async function loadOrder(ctx: Ctx, orderId: string) {
  const [{ data: order }, { data: items }, { data: shipments }] = await Promise.all([
    ctx.supabase.from("orders").select("id, order_number, email, phone, customer_name, status, payment_status, fulfillment_status, payment_method, subtotal, discount_total, shipping_total, cod_fee, grand_total, shipping_address, placed_at").eq("id", orderId).maybeSingle(),
    ctx.supabase.from("order_items").select("product_title, variant_title, sku, quantity, line_total, tax_rate_bps, variant:product_variants(weight_grams), product:products(weight_grams)").eq("order_id", orderId).order("created_at"),
    ctx.supabase.from("shipments").select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
  ]);
  return { order, items: items ?? [], shipments: (shipments ?? []) as Tables<"shipments">[] };
}

/** Estimated parcel weight from the items' weights, or the default per item. */
function weightKg(items: { quantity: number; variant: { weight_grams: number | null } | null; product: { weight_grams: number | null } | null }[], perItem: number) {
  const grams = items.reduce((n, i) => n + (i.variant?.weight_grams || i.product?.weight_grams || perItem) * i.quantity, 0);
  return Math.max(Math.round(grams / 10) / 100, 0.1);
}

const activeBooking = (shipments: Tables<"shipments">[]) => shipments.find((s) => s.provider === "shiprocket" && s.status !== "cancelled");

export interface CourierChoice {
  id: number;
  name: string;
  rate: number;
  etd: string;
  days: number | null;
  cod: boolean;
  rating: number | null;
  recommended: boolean;
}

/** Couriers that serve this order's PIN code, with Shiprocket's price and delivery estimate. */
export async function courierOptions(orderId: string): Promise<ActionResult<{ couriers: CourierChoice[]; preferredId: number | null; parcel: { weightKg: number; length: number; breadth: number; height: number } }>> {
  const ctx = await role("staff");
  if (!ctx) return fail("Staff access required.");
  if (!uuid.safeParse(orderId).success) return fail("Order not found.");
  const settings = await loadSettings(ctx);
  const notReady = ready(settings);
  if (notReady) return fail(notReady);
  if (!settings!.shiprocket_pickup_postcode) return fail("Add your pickup PIN code in Shipping › Courier connection.");
  const { order, items } = await loadOrder(ctx, orderId);
  if (!order) return fail("Order not found.");
  const pack = packageDefaultsOf(settings!);
  const parcel = { weightKg: weightKg(items, pack.item_weight_grams), length: pack.length_cm, breadth: pack.breadth_cm, height: pack.height_cm };
  try {
    const cod = order.payment_method === "cod" && order.payment_status === "unpaid";
    const res = await shiprocket.serviceability({
      pickup: settings!.shiprocket_pickup_postcode,
      delivery: String((order.shipping_address as Address).postal_code ?? ""),
      weightKg: parcel.weightKg,
      cod,
      declaredValue: order.grand_total / 100,
    });
    const couriers = res.couriers
      .filter((c) => !cod || c.cod)
      .sort((a, b) => a.rate - b.rate)
      .map((c) => ({ ...c, recommended: c.id === res.recommendedId }));
    // The store's default pick (Shipping › Courier connection); staff can change it.
    const byDays = [...couriers].sort((a, b) => (a.days ?? 99) - (b.days ?? 99) || a.rate - b.rate);
    const preferredId =
      settings!.shiprocket_courier_choice === "cheapest" ? couriers[0]?.id ?? null
      : settings!.shiprocket_courier_choice === "fastest" ? byDays[0]?.id ?? null
      : null;
    return ok({ couriers, preferredId, parcel });
  } catch (e) {
    return fail(problem(e, "Couldn't reach Shiprocket. Try again in a moment."));
  }
}

const bookSchema = z.object({
  orderId: uuid,
  orderNumber: z.string().min(3).max(40),
  courierId: z.number().int().positive().nullable(),
  weightKg: z.number().min(0.05).max(100),
  length: z.number().min(1).max(300),
  breadth: z.number().min(1).max(300),
  height: z.number().min(1).max(300),
});

const rupees = (paise: number) => Math.round(paise) / 100;
const digits10 = (phone: string) => phone.replace(/\D/g, "").slice(-10);

function istStamp(iso: string) {
  const d = new Date(Date.parse(iso) + 5.5 * 3600_000).toISOString();
  return `${d.slice(0, 10)} ${d.slice(11, 16)}`;
}

/**
 * Books a courier for an order: creates it in Shiprocket, assigns an AWB and schedules the
 * pickup. Each step is recorded as it succeeds, so running it again after a failure
 * carries on where it stopped instead of booking twice.
 */
export async function bookCourier(input: z.infer<typeof bookSchema>): Promise<ActionResult<{ awb: string; courier: string }>> {
  const ctx = await role("staff");
  if (!ctx) return fail("Staff access required.");
  const parsed = bookSchema.safeParse(input);
  if (!parsed.success) return fail("Check the parcel weight and size.");
  const d = parsed.data;
  const settings = await loadSettings(ctx);
  const notReady = ready(settings);
  if (notReady) return fail(notReady);
  const { order, items, shipments } = await loadOrder(ctx, d.orderId);
  if (!order) return fail("Order not found.");
  if (!["confirmed", "completed"].includes(order.status)) return fail(order.status === "pending_payment" ? "This order is still waiting for payment." : "This order was cancelled.");
  if (!["unfulfilled", "processing", "packed"].includes(order.fulfillment_status)) return fail("This order has already shipped.");

  const record = async (booking: Record<string, unknown>) => {
    const { error } = await ctx.supabase.rpc("admin_record_courier_booking", { p_order_id: order.id, p_booking: { provider: "shiprocket", ...booking } });
    if (error) throw new Error(friendlyError(error, "The booking couldn't be saved."));
  };
  const pkg = { length_cm: d.length, breadth_cm: d.breadth, height_cm: d.height, weight_kg: d.weightKg };

  try {
    let booking = activeBooking(shipments);
    if (!booking?.provider_shipment_id) {
      const a = (order.shipping_address ?? {}) as Address;
      const [first, ...rest] = String(a.full_name || order.customer_name || "Customer").trim().split(/\s+/);
      const earlier = shipments.filter((s) => s.provider === "shiprocket").length;
      const created = await shiprocket.createOrder({
        order_id: earlier ? `${order.order_number}-${earlier + 1}` : order.order_number,
        order_date: istStamp(order.placed_at),
        pickup_location: settings!.shiprocket_pickup_location,
        billing_customer_name: first,
        billing_last_name: rest.join(" "),
        billing_address: String(a.line1 ?? ""),
        billing_address_2: [a.line2, a.landmark].filter(Boolean).join(", "),
        billing_city: String(a.city ?? ""),
        billing_pincode: String(a.postal_code ?? ""),
        billing_state: String(a.state ?? ""),
        billing_country: "India",
        billing_email: order.email,
        billing_phone: digits10(a.phone || order.phone || ""),
        shipping_is_billing: true,
        order_items: items.map((i) => ({
          name: `${i.product_title}${i.variant_title ? ` (${i.variant_title})` : ""}`.slice(0, 200),
          sku: i.sku,
          units: i.quantity,
          selling_price: rupees(i.line_total / i.quantity),
          discount: 0,
          tax: i.tax_rate_bps / 100,
        })),
        payment_method: order.payment_method === "cod" && order.payment_status === "unpaid" ? "COD" : "Prepaid",
        shipping_charges: rupees(order.shipping_total),
        transaction_charges: rupees(order.cod_fee),
        total_discount: 0,
        sub_total: rupees(items.reduce((n, i) => n + i.line_total, 0)),
        length: d.length,
        breadth: d.breadth,
        height: d.height,
        weight: d.weightKg,
      });
      await record({ provider_order_id: created.orderId, provider_shipment_id: created.shipmentId, package: pkg });
      booking = { provider_shipment_id: created.shipmentId, tracking_number: "", pickup_scheduled_for: null } as unknown as Tables<"shipments">;
    }
    const shipmentId = booking.provider_shipment_id!;
    let awb = booking.tracking_number;
    let courier = booking.carrier;
    if (!awb) {
      const assigned = await shiprocket.assignAwb(shipmentId, d.courierId ?? undefined);
      awb = assigned.awb;
      courier = assigned.courier;
      await record({ provider_shipment_id: shipmentId, awb, courier, tracking_url: shiprocket.shiprocketTrackingUrl(awb) });
    }
    if (!booking.pickup_scheduled_for) {
      try {
        const pickup = await shiprocket.schedulePickup(shipmentId);
        await record({ provider_shipment_id: shipmentId, pickup_scheduled_for: pickup.pickupAt ?? new Date().toISOString() });
      } catch (e) {
        refresh(d.orderNumber);
        return ok({ awb, courier }, `Courier booked (AWB ${awb}), but the pickup wasn't scheduled: ${problem(e, "try again")}. Use "Schedule pickup" to retry.`);
      }
    }
    refresh(d.orderNumber);
    return ok({ awb, courier }, `Courier booked: ${courier || "courier"}, AWB ${awb}.`);
  } catch (e) {
    refresh(d.orderNumber);
    return fail(e instanceof shiprocket.ShiprocketError ? problem(e, "") : (e as Error).message || "The booking couldn't be completed.");
  }
}

/** Schedules the pickup for a booking whose pickup failed earlier. */
export async function scheduleCourierPickup(orderId: string, orderNumber: string): Promise<ActionResult<null>> {
  const ctx = await role("staff");
  if (!ctx) return fail("Staff access required.");
  if (!uuid.safeParse(orderId).success) return fail("Order not found.");
  const notReady = ready(await loadSettings(ctx));
  if (notReady) return fail(notReady);
  const { shipments } = await loadOrder(ctx, orderId);
  const booking = activeBooking(shipments);
  if (!booking?.provider_shipment_id || !booking.tracking_number) return fail("Book a courier first.");
  try {
    const pickup = await shiprocket.schedulePickup(booking.provider_shipment_id);
    const { error } = await ctx.supabase.rpc("admin_record_courier_booking", {
      p_order_id: orderId,
      p_booking: { provider: "shiprocket", provider_shipment_id: booking.provider_shipment_id, pickup_scheduled_for: pickup.pickupAt ?? new Date().toISOString() },
    });
    if (error) return fail(friendlyError(error));
    refresh(orderNumber);
    return ok(null, "Pickup scheduled.");
  } catch (e) {
    return fail(problem(e, "Couldn't schedule the pickup."));
  }
}

/** A fresh link to the shipping label PDF. */
export async function courierLabel(orderId: string): Promise<ActionResult<{ url: string }>> {
  const ctx = await role("staff");
  if (!ctx) return fail("Staff access required.");
  if (!uuid.safeParse(orderId).success) return fail("Order not found.");
  if (!shiprocket.shiprocketConfigured()) return fail("Shiprocket isn't connected.");
  const { shipments } = await loadOrder(ctx, orderId);
  const booking = activeBooking(shipments);
  if (!booking?.provider_shipment_id || !booking.tracking_number) return fail("Book a courier first.");
  try {
    const url = await shiprocket.labelUrl(booking.provider_shipment_id);
    if (!/^https:\/\//.test(url) && !url.startsWith("http://localhost") && !url.startsWith("http://127.0.0.1")) return fail("Shiprocket returned an unexpected label link.");
    return ok({ url });
  } catch (e) {
    return fail(problem(e, "Couldn't get the label."));
  }
}

/** Cancels a booking that hasn't been picked up yet, at Shiprocket and in the store. */
export async function cancelCourier(orderId: string, orderNumber: string): Promise<ActionResult<null>> {
  const ctx = await role("staff");
  if (!ctx) return fail("Staff access required.");
  if (!uuid.safeParse(orderId).success) return fail("Order not found.");
  if (!shiprocket.shiprocketConfigured()) return fail("Shiprocket isn't connected.");
  const { shipments } = await loadOrder(ctx, orderId);
  const booking = activeBooking(shipments);
  if (!booking) return fail("There's no courier booking to cancel.");
  if (booking.status !== "packed") return fail("This parcel has already left with the courier, so the booking can't be cancelled.");
  try {
    if (booking.provider_order_id) await shiprocket.cancelOrder(booking.provider_order_id);
  } catch (e) {
    return fail(problem(e, "Couldn't cancel the booking at Shiprocket."));
  }
  const { error } = await ctx.supabase.rpc("admin_cancel_courier_booking", { p_order_id: orderId, p_shipment_id: booking.id });
  if (error) return fail(friendlyError(error));
  refresh(orderNumber);
  return ok(null, "Courier booking cancelled. You can book again.");
}

/** Pulls the latest tracking from Shiprocket, for when a webhook was missed. */
export async function refreshTracking(orderId: string, orderNumber: string): Promise<ActionResult<null>> {
  const ctx = await role("staff");
  if (!ctx) return fail("Staff access required.");
  if (!uuid.safeParse(orderId).success) return fail("Order not found.");
  if (!shiprocket.shiprocketConfigured()) return fail("Shiprocket isn't connected.");
  const { shipments } = await loadOrder(ctx, orderId);
  const booking = activeBooking(shipments);
  if (!booking?.tracking_number) return fail("There's no tracking number yet.");
  try {
    const t = await shiprocket.track(booking.tracking_number);
    const latest = [...t.activities]
      .map((a) => ({ ...a, iso: parseShiprocketDate(a.date) }))
      .filter((a) => a.iso)
      .sort((x, y) => (x.iso! < y.iso! ? 1 : -1))[0];
    const label = t.status || latest?.srLabel || latest?.activity || "";
    if (!label) return ok(null, "No tracking updates yet.");
    const etd = parseShiprocketDate(t.etd);
    const { data, error } = await supabaseService().rpc("courier_update", {
      p_provider: "shiprocket",
      p_event_key: `${booking.tracking_number}|refresh|${latest?.date ?? label}`,
      p_awb: booking.tracking_number,
      p_status: normalizeShiprocketStatus(label, t.statusId),
      p_label: prettyStatus(label),
      p_location: latest?.location ?? "",
      p_event_at: latest?.iso ?? new Date().toISOString(),
      p_etd: etd ? new Date(Date.parse(etd) + 5.5 * 3600_000).toISOString().slice(0, 10) : undefined,
      p_payload: { source: "refresh", status: label },
    });
    if (error) return fail(friendlyError(error));
    after(() => processOutbox());
    refresh(orderNumber);
    const r = data as { result?: string; duplicate?: boolean } | null;
    return ok(null, r?.duplicate ? "Tracking is up to date." : `Tracking updated: ${prettyStatus(label)}.`);
  } catch (e) {
    return fail(problem(e, "Couldn't get tracking from Shiprocket."));
  }
}

/** Staff record a parcel that came back undelivered (return to origin). */
export async function markReturnedToOrigin(orderId: string, orderNumber: string, note: string): Promise<ActionResult<null>> {
  const ctx = await role("staff");
  if (!ctx) return fail("Staff access required.");
  if (!uuid.safeParse(orderId).success) return fail("Order not found.");
  const { error } = await ctx.supabase.rpc("admin_mark_rto", { p_order_id: orderId, p_note: note.trim().slice(0, 2000) || undefined });
  if (error) return fail(friendlyError(error, "The order couldn't be updated."));
  after(() => processOutbox());
  refresh(orderNumber);
  return ok(null, "Marked as returned to origin. The stock is back on sale.");
}

/** Checks the Shiprocket API user can sign in (Shipping › Courier connection). */
export async function testShiprocket(): Promise<ActionResult<null>> {
  const ctx = await role("admin");
  if (!ctx) return fail("Only admins can do this.");
  if (!shiprocket.shiprocketConfigured()) return fail("Set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD on the server first.");
  try {
    await shiprocket.testConnection();
    return ok(null, "Connected to Shiprocket.");
  } catch (e) {
    return fail(problem(e, "Couldn't reach Shiprocket."));
  }
}
