// Cash-on-delivery safeguards at the database level: limits on open cash orders and on
// customers whose cash parcels came back, blocking by email or phone, and confirmation by
// the customer before anything ships.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { address, anon, guestToken, makeProduct, makeUser, service, sql, uniqueEmail, uniquePhone, type TestUser } from "./helpers";

const sb = service();
let staff: TestUser;
let customer: TestUser;
let before: Record<string, unknown>;

beforeAll(async () => {
  [staff, customer] = await Promise.all([makeUser("staff"), makeUser()]);
  [before] = await sql("select cod_confirmation, cod_confirm_hours, cod_max_open_orders, cod_max_returned from public.store_settings where id = 1");
  await sql("update public.store_settings set cod_confirmation = false, cod_max_open_orders = 2, cod_max_returned = 1 where id = 1");
});

afterAll(async () => {
  await sql("update public.store_settings set cod_confirmation = $1, cod_confirm_hours = $2, cod_max_open_orders = $3, cod_max_returned = $4 where id = 1",
    [before.cod_confirmation, before.cod_confirm_hours, before.cod_max_open_orders, before.cod_max_returned]);
});

async function cart(stock = 5) {
  const p = await makeProduct({ stock });
  const token = guestToken();
  await sb.rpc("cart_set_item", { p_user_id: null, p_token: token, p_variant_id: p.variantId, p_quantity: 1, p_mode: "add" });
  return { token, product: p };
}

async function place(who: { email: string; phone: string }, method: "cod" | "razorpay" = "cod") {
  const { token, product } = await cart();
  const res = await sb.rpc("place_order", {
    p_user_id: null, p_cart_token: token, p_idempotency_key: randomUUID(), p_email: who.email, p_phone: who.phone,
    p_shipping_address: { ...address, phone: who.phone }, p_billing_address: null, p_rate_id: null, p_payment_method: method,
  });
  return { ...res, product };
}

const someone = () => ({ email: uniqueEmail("cod"), phone: uniquePhone() });

describe("who can pay cash on delivery", () => {
  it("not a customer with too many cash orders still waiting to ship", async () => {
    const who = someone();
    expect((await place(who)).error).toBeNull();
    expect((await place(who)).error).toBeNull();
    const third = await place(who);
    expect(third.error?.message).toBe("cod_unavailable");
    expect(third.error?.hint).toContain("2 cash-on-delivery orders waiting to ship");
    // The same phone with another email address counts too ("+91 98450…" vs "098450…").
    const sameNumber = await place({ email: uniqueEmail("other"), phone: `0${who.phone.replace(/\D/g, "").slice(-10)}` });
    expect(sameNumber.error?.message).toBe("cod_unavailable");
    // Paying online is still fine.
    expect((await place(who, "razorpay")).error).toBeNull();
  });

  it("the quote shows the reason and leaves out the cash fee", async () => {
    await sql("update public.store_settings set cod_fee = 4900 where id = 1");
    try {
      const who = someone();
      await place(who);
      await place(who);
      const { token } = await cart();
      const { data } = await sb.rpc("cart_get", { p_user_id: null, p_token: token, p_address: { ...address, phone: who.phone }, p_payment_method: "cod", p_email: who.email });
      expect(data.payment_methods.cod).toBe(false);
      expect(data.payment_methods.cod_reason).toContain("Please pay online");
      expect(data.cod_fee).toBe(0);
      expect(data.grand_total).toBe(data.subtotal - data.discount_total + (data.shipping_total ?? 0) + (data.tax_mode === "exclusive" ? data.tax_total : 0));
    } finally {
      await sql("update public.store_settings set cod_fee = 0 where id = 1");
    }
  });

  it("not a customer whose cash parcels came back undelivered", async () => {
    const who = someone();
    const first = await place(who);
    expect(first.error).toBeNull();
    await staff.client.rpc("admin_set_fulfillment", { p_order_id: first.data.id, p_status: "shipped", p_carrier: "Delhivery", p_tracking_number: `RTO${Date.now()}` });
    expect((await staff.client.rpc("admin_mark_rto", { p_order_id: first.data.id })).error).toBeNull();
    const next = await place(who);
    expect(next.error?.message).toBe("cod_unavailable");
    expect(next.error?.hint).toContain("returned");
  });

  it("not a customer staff have blocked, until they're allowed again", async () => {
    const who = someone();
    const first = await place(who);
    expect((await customer.client.rpc("admin_set_cod_block", { p_order_id: first.data.id, p_blocked: true })).error).not.toBeNull();
    expect((await staff.client.rpc("admin_set_cod_block", { p_order_id: first.data.id, p_blocked: true, p_reason: "Refused twice" })).error).toBeNull();
    const { data: status } = await staff.client.rpc("admin_order_cod_status", { p_order_id: first.data.id });
    expect(status).toMatchObject({ blocked: true, open: 1, returned: 0 });
    expect((await place(who)).error?.message).toBe("cod_unavailable");
    expect((await staff.client.rpc("admin_set_cod_block", { p_order_id: first.data.id, p_blocked: false })).error).toBeNull();
    expect((await place(who)).error).toBeNull();
    expect((await customer.client.from("cod_blocklist").select("value")).data).toEqual([]);
  });
});

describe("confirmation by the customer", () => {
  beforeAll(async () => {
    await sql("update public.store_settings set cod_confirmation = true, cod_confirm_hours = 12 where id = 1");
  });
  afterAll(async () => {
    await sql("update public.store_settings set cod_confirmation = false where id = 1");
  });

  it("holds the order until the customer confirms it", async () => {
    const placed = await place(someone());
    expect(placed.error).toBeNull();
    const [o] = await sql<{ cod_confirmation: string; hours: number }>(
      "select cod_confirmation, round(extract(epoch from cod_confirm_by - placed_at) / 3600)::int as hours from public.orders where id = $1", [placed.data.id]);
    expect(o).toEqual({ cod_confirmation: "pending", hours: 12 });

    const pack = await staff.client.rpc("admin_set_fulfillment", { p_order_id: placed.data.id, p_status: "packed" });
    expect(pack.error?.message).toBe("cod_unconfirmed");
    expect((await customer.client.rpc("confirm_cod_order", { p_order_id: placed.data.id })).error).not.toBeNull();

    const confirmed = await sb.rpc("confirm_cod_order", { p_order_id: placed.data.id });
    expect(confirmed.data.already).toBe(false);
    expect((await sb.rpc("confirm_cod_order", { p_order_id: placed.data.id })).data.already).toBe(true);
    expect((await staff.client.rpc("admin_set_fulfillment", { p_order_id: placed.data.id, p_status: "packed" })).error).toBeNull();
    const { data: detail } = await sb.rpc("order_detail", { p_order_id: placed.data.id });
    expect(detail.events.map((e: { message: string }) => e.message)).toContain("You confirmed this cash-on-delivery order.");
  });

  it("staff can confirm after speaking to the customer; online payments never wait", async () => {
    const placed = await place(someone());
    expect((await staff.client.rpc("admin_confirm_cod", { p_order_id: placed.data.id })).error).toBeNull();
    expect((await staff.client.rpc("admin_set_fulfillment", { p_order_id: placed.data.id, p_status: "packed" })).error).toBeNull();
    const online = await place(someone(), "razorpay");
    const [o] = await sql<{ cod_confirmation: string }>("select cod_confirmation from public.orders where id = $1", [online.data.id]);
    expect(o.cod_confirmation).toBe("not_required");
  });

  it("cancels orders not confirmed in time and puts the stock back", async () => {
    const placed = await place(someone());
    const variant = placed.product.variantId;
    const stockOf = async () => (await sql<{ stock_quantity: number }>("select stock_quantity from public.product_variants where id = $1", [variant]))[0].stock_quantity;
    expect(await stockOf()).toBe(4);
    await sql("update public.orders set cod_confirm_by = now() - interval '1 minute' where id = $1", [placed.data.id]);
    const { data: done } = await sb.rpc("housekeeping");
    expect(done.cancelled_unconfirmed_cod).toBeGreaterThanOrEqual(1);
    const [o] = await sql<{ status: string; cancel_reason: string; payment_status: string }>(
      "select status, cancel_reason, payment_status from public.orders where id = $1", [placed.data.id]);
    expect(o).toEqual({ status: "cancelled", cancel_reason: "cod_unconfirmed", payment_status: "voided" });
    expect(await stockOf()).toBe(5);
    const [{ n }] = await sql<{ n: number }>("select count(*)::int as n from public.email_outbox where order_id = $1 and template = 'order_cancelled'", [placed.data.id]);
    expect(n).toBe(1);
  });

  it("asks for confirmation on WhatsApp when the store has that template", async () => {
    const [ws] = await sql("select whatsapp_enabled, whatsapp_templates from public.store_settings where id = 1");
    await sql(`update public.store_settings set whatsapp_enabled = true, whatsapp_templates =
      '{"order_confirmation": {"name": "order_confirmed", "language": "en"}, "cod_confirm": {"name": "confirm_cod", "language": "en"}}' where id = 1`);
    try {
      const { token } = await cart();
      await sb.rpc("cart_set_contact", { p_user_id: null, p_token: token, p_contact: { whatsapp_opt_in: true } });
      const phone = uniquePhone();
      const placed = await sb.rpc("place_order", {
        p_user_id: null, p_cart_token: token, p_idempotency_key: randomUUID(), p_email: uniqueEmail("wa"), p_phone: phone,
        p_shipping_address: { ...address, phone }, p_billing_address: null, p_rate_id: null, p_payment_method: "cod",
      });
      expect(placed.error).toBeNull();
      const rows = await sql<{ template: string }>("select template from public.whatsapp_outbox where order_id = $1", [placed.data.id]);
      expect(rows.map((r) => r.template)).toEqual(["cod_confirm"]);
    } finally {
      await sql("update public.store_settings set whatsapp_enabled = $1, whatsapp_templates = $2 where id = 1", [ws.whatsapp_enabled, ws.whatsapp_templates]);
    }
  });

  it("is server-only for customers and visitors", async () => {
    const placed = await place(someone());
    for (const client of [anon(), customer.client]) {
      expect((await client.rpc("admin_confirm_cod", { p_order_id: placed.data.id })).error).not.toBeNull();
      expect((await client.rpc("cancel_unconfirmed_cod_orders", { p_limit: 10 })).error).not.toBeNull();
    }
  });
});
