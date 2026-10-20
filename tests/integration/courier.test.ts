// Courier bookings and tracking updates (Shiprocket) at the database level: who may record
// a booking, how tracking moves an order along, and what happens when a parcel comes back.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { address, anon, guestToken, makeProduct, makeUser, service, sql, type TestUser } from "./helpers";

const sb = service();
let staff: TestUser;
let customer: TestUser;

beforeAll(async () => {
  [staff, customer] = await Promise.all([makeUser("staff", "Sam Staff"), makeUser(undefined, "Cara Customer")]);
});

async function order(method: "cod" | "razorpay", stock = 5) {
  const p = await makeProduct({ stock });
  const token = guestToken();
  expect((await sb.rpc("cart_set_item", { p_user_id: null, p_token: token, p_variant_id: p.variantId, p_quantity: 2, p_mode: "add" })).error).toBeNull();
  const placed = await sb.rpc("place_order", {
    p_user_id: null, p_cart_token: token, p_idempotency_key: randomUUID(), p_email: `c-${p.sku.toLowerCase()}@example.com`, p_phone: "",
    p_shipping_address: address, p_billing_address: null, p_rate_id: null, p_payment_method: method,
  });
  expect(placed.error).toBeNull();
  if (method === "razorpay") {
    const paid = await sb.rpc("confirm_order_payment", {
      p_order_id: placed.data.id, p_provider: "razorpay", p_provider_order_id: `order_${p.sku}`, p_provider_payment_id: `pay_${p.sku}`,
      p_amount: placed.data.grand_total, p_currency: "INR", p_method: "upi", p_details: {},
    });
    expect(paid.error).toBeNull();
  }
  return { id: placed.data.id as string, product: p };
}

async function book(orderId: string, awb = `AWB${Date.now()}${Math.floor(Math.random() * 1000)}`) {
  const shipmentId = String(Math.floor(Math.random() * 1e9));
  const created = await staff.client.rpc("admin_record_courier_booking", {
    p_order_id: orderId,
    p_booking: { provider: "shiprocket", provider_order_id: `SR${shipmentId}`, provider_shipment_id: shipmentId, package: { weight_kg: 0.6 } },
  });
  expect(created.error).toBeNull();
  const assigned = await staff.client.rpc("admin_record_courier_booking", {
    p_order_id: orderId,
    p_booking: { provider: "shiprocket", provider_shipment_id: shipmentId, awb, courier: "Delhivery Surface", tracking_url: `https://shiprocket.co/tracking/${awb}` },
  });
  expect(assigned.error).toBeNull();
  return { awb, shipmentId };
}

const track = (awb: string, status: string, label: string, at = new Date().toISOString(), key = `${awb}|${status}|${at}`) =>
  sb.rpc("courier_update", { p_provider: "shiprocket", p_event_key: key, p_awb: awb, p_status: status, p_label: label, p_location: "Bengaluru_Hub", p_event_at: at, p_payload: {} });

async function orderRow(id: string) {
  const [o] = await sql<{ status: string; payment_status: string; fulfillment_status: string; needs_attention: boolean; attention_reason: string | null }>(
    "select status, payment_status, fulfillment_status, needs_attention, attention_reason from public.orders where id = $1", [id]);
  return o;
}

const emails = (id: string, template: string) =>
  sql<{ n: number }>("select count(*)::int as n from public.email_outbox where order_id = $1 and template = $2", [id, template]).then((r) => r[0].n);

describe("courier bookings", () => {
  it("staff record a booking; the order is packed and the AWB is noted internally", async () => {
    const o = await order("cod");
    const { awb } = await book(o.id);
    expect((await orderRow(o.id)).fulfillment_status).toBe("packed");
    const [ship] = await sql<{ status: string; provider: string; tracking_number: string; carrier: string }>(
      "select status, provider, tracking_number, carrier from public.shipments where order_id = $1", [o.id]);
    expect(ship).toEqual({ status: "packed", provider: "shiprocket", tracking_number: awb, carrier: "Delhivery Surface" });
    const [event] = await sql<{ is_internal: boolean; message: string }>(
      "select is_internal, message from public.order_events where order_id = $1 and kind = 'courier_booked'", [o.id]);
    expect(event.is_internal).toBe(true);
    expect(event.message).toContain(awb);
  });

  it("customers and visitors can't record bookings, mark returns or post tracking", async () => {
    const o = await order("cod");
    const booking = { provider: "shiprocket", provider_shipment_id: "1", awb: "X1" };
    expect((await customer.client.rpc("admin_record_courier_booking", { p_order_id: o.id, p_booking: booking })).error).not.toBeNull();
    expect((await customer.client.rpc("admin_mark_rto", { p_order_id: o.id })).error).not.toBeNull();
    for (const client of [anon(), customer.client, staff.client]) {
      const { error } = await client.rpc("courier_update", { p_provider: "shiprocket", p_event_key: "k", p_awb: "X1", p_status: "delivered", p_label: "Delivered" });
      expect(error).not.toBeNull();
    }
    expect((await orderRow(o.id)).fulfillment_status).toBe("unfulfilled");
  });

  it("a cancelled booking is hidden from the customer and the order can be booked again", async () => {
    const o = await order("cod");
    const first = await book(o.id);
    const [s] = await sql<{ id: string }>("select id from public.shipments where order_id = $1", [o.id]);
    expect((await staff.client.rpc("admin_cancel_courier_booking", { p_order_id: o.id, p_shipment_id: s.id })).error).toBeNull();
    expect((await track(first.awb, "cancelled", "Canceled")).data.result).toBe("recorded");
    const second = await book(o.id);
    const { data: detail } = await sb.rpc("order_detail", { p_order_id: o.id });
    expect(detail.shipments).toHaveLength(1);
    expect(detail.shipments[0].tracking_number).toBe(second.awb);
    expect(detail.shipments[0]).not.toHaveProperty("provider_shipment_id");
    expect(detail.shipments[0]).not.toHaveProperty("provider_order_id");
  });
});

describe("tracking updates", () => {
  it("move the order to shipped and delivered, emailing the customer once each", async () => {
    const o = await order("razorpay");
    const { awb } = await book(o.id);
    const t0 = new Date(Date.now() - 3600_000).toISOString();
    const first = await track(awb, "in_transit", "Picked up", t0);
    expect(first.data.result).toBe("shipped");
    // The same delivery again changes nothing and sends nothing.
    expect((await track(awb, "in_transit", "Picked up", t0)).data.duplicate).toBe(true);
    expect((await orderRow(o.id)).fulfillment_status).toBe("shipped");
    expect(await emails(o.id, "order_shipped")).toBe(1);

    expect((await track(awb, "out_for_delivery", "Out for delivery")).data.result).toBe("recorded");
    // An older scan arriving late doesn't replace the latest status.
    await track(awb, "in_transit", "In transit", new Date(Date.now() - 1800_000).toISOString());
    const [ship] = await sql<{ courier_status: string; events: number }>(
      "select courier_status, jsonb_array_length(courier_events) as events from public.shipments where tracking_number = $1", [awb]);
    expect(ship).toEqual({ courier_status: "Out for delivery", events: 3 });

    expect((await track(awb, "delivered", "Delivered")).data.result).toBe("delivered");
    const done = await orderRow(o.id);
    expect(done).toMatchObject({ status: "completed", fulfillment_status: "delivered" });
    expect(await emails(o.id, "order_delivered")).toBe(1);
    const [actor] = await sql<{ actor_type: string }>("select actor_type from public.order_events where order_id = $1 and message = 'Delivered.'", [o.id]);
    expect(actor.actor_type).toBe("provider");
  });

  it("a failed delivery attempt flags the order for staff", async () => {
    const o = await order("cod");
    const { awb } = await book(o.id);
    await track(awb, "in_transit", "In transit");
    expect((await track(awb, "undelivered", "Customer not available")).data.result).toBe("flagged");
    const row = await orderRow(o.id);
    expect(row.needs_attention).toBe(true);
    expect(row.attention_reason).toContain("Customer not available");
  });

  it("ignores tracking numbers the store didn't book", async () => {
    const res = await track(`UNKNOWN${Date.now()}`, "delivered", "Delivered");
    expect(res.data).toMatchObject({ ok: false, error: "unknown_awb" });
  });
});

describe("parcels returned undelivered", () => {
  it("cancel an unpaid cash-on-delivery order and put the stock back", async () => {
    const o = await order("cod", 5);
    const { awb } = await book(o.id);
    await track(awb, "in_transit", "In transit");
    const [before] = await sql<{ stock_quantity: number }>("select stock_quantity from public.product_variants where id = $1", [o.product.variantId]);
    expect(before.stock_quantity).toBe(3);

    expect((await track(awb, "rto_delivered", "RTO delivered")).data.result).toBe("returned_to_origin");
    expect(await orderRow(o.id)).toMatchObject({ status: "cancelled", payment_status: "voided", fulfillment_status: "returned" });
    const [after] = await sql<{ stock_quantity: number }>("select stock_quantity from public.product_variants where id = $1", [o.product.variantId]);
    expect(after.stock_quantity).toBe(5);
    expect(await emails(o.id, "order_cancelled")).toBe(1);
    // A second notice is harmless.
    await track(awb, "rto_delivered", "RTO delivered", new Date(Date.now() + 1000).toISOString());
    const [again] = await sql<{ stock_quantity: number }>("select stock_quantity from public.product_variants where id = $1", [o.product.variantId]);
    expect(again.stock_quantity).toBe(5);
  });

  it("flag a paid order for a refund, and staff can record one by hand", async () => {
    const o = await order("razorpay", 5);
    const { awb } = await book(o.id);
    await track(awb, "in_transit", "In transit");
    const res = await staff.client.rpc("admin_mark_rto", { p_order_id: o.id, p_note: "Address not found" });
    expect(res.error).toBeNull();
    const row = await orderRow(o.id);
    expect(row).toMatchObject({ status: "confirmed", payment_status: "paid", fulfillment_status: "returned", needs_attention: true });
    expect(row.attention_reason).toContain("Refund");
    const [stock] = await sql<{ stock_quantity: number }>("select stock_quantity from public.product_variants where id = $1", [o.product.variantId]);
    expect(stock.stock_quantity).toBe(5);
  });

  it("only orders on their way can be marked returned to origin", async () => {
    const o = await order("cod");
    const { error } = await staff.client.rpc("admin_mark_rto", { p_order_id: o.id });
    expect(error?.message).toBe("not_in_transit");
  });
});
