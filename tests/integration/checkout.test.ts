// Acceptance tests 2-4 and 6 at the database level: server-side pricing, order
// snapshots, stock reservations, concurrent checkouts, failed/expired/duplicate payments
// and coupon limits.
import { describe, expect, it } from "vitest";
import { address, guestToken, makeProduct, makeUser, service, sql, uniqueAddress, uniqueEmail } from "./helpers";

const sb = service();

async function guestCart(variantId: string, quantity = 1) {
  const token = guestToken();
  const res = await sb.rpc("cart_set_item", { p_user_id: null, p_token: token, p_variant_id: variantId, p_quantity: quantity, p_mode: "add" });
  if (res.error) throw res.error;
  return token;
}

function place(token: string, method: "razorpay" | "cod" = "razorpay", email = uniqueEmail()) {
  return sb.rpc("place_order", {
    p_user_id: null, p_cart_token: token, p_idempotency_key: crypto.randomUUID(), p_email: email, p_phone: "",
    p_shipping_address: uniqueAddress(), p_billing_address: null, p_rate_id: null, p_payment_method: method,
  });
}

/** Expires an unpaid order and waits until it is released (a checkout running in another test may release it first). */
async function expire(orderId: string) {
  await sql("update public.orders set expires_at = now() - interval '1 minute' where id = $1", [orderId]);
  for (let i = 0; i < 50; i++) {
    await sb.rpc("release_expired_orders", { p_limit: 100 });
    const [o] = await sql<{ status: string }>("select status from public.orders where id = $1", [orderId]);
    if (o.status === "cancelled") return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("The order was not released.");
}

async function stock(variantId: string) {
  const [row] = await sql<{ stock_quantity: number; reserved_quantity: number }>(
    "select stock_quantity, reserved_quantity from public.product_variants where id = $1", [variantId]);
  return row;
}

describe("pricing", () => {
  it("prices the cart from the catalog, never from the browser", async () => {
    const p = await makeProduct({ stock: 10, price: 249900 });
    const token = await guestCart(p.variantId, 2);
    const quote = await sb.rpc("cart_get", { p_user_id: null, p_token: token, p_address: address });
    expect(quote.error).toBeNull();
    expect(quote.data.subtotal).toBe(499800);
    expect(quote.data.lines[0].unit_price).toBe(249900);
    // The quote's arithmetic adds up.
    const q = quote.data;
    expect(q.grand_total).toBe(q.subtotal - q.discount_total + q.shipping_total + q.cod_fee + (q.tax_mode === "exclusive" ? q.tax_total : 0));
  });

  it("keeps the price paid on the order after the catalog price changes", async () => {
    const p = await makeProduct({ stock: 10, price: 300000 });
    const token = await guestCart(p.variantId, 1);
    const placed = await place(token, "cod");
    expect(placed.error).toBeNull();
    await sql("update public.products set price = 999900 where id = $1", [p.productId]);
    const [item] = await sql<{ unit_price: string; product_title: string }>(
      "select unit_price, product_title from public.order_items where order_id = $1", [placed.data.id]);
    expect(Number(item.unit_price)).toBe(300000);
    const [prod] = await sql<{ min_price: string }>("select min_price from public.products where id = $1", [p.productId]);
    expect(Number(prod.min_price)).toBe(999900);
  });
});

describe("stock under concurrency", () => {
  it("never oversells when many customers pay online at the same moment", async () => {
    const p = await makeProduct({ stock: 5 });
    const tokens = await Promise.all(Array.from({ length: 20 }, () => guestCart(p.variantId, 1)));
    const results = await Promise.all(tokens.map((t) => place(t)));
    const ok = results.filter((r) => !r.error);
    expect(ok).toHaveLength(5);
    for (const r of results.filter((x) => x.error)) {
      expect(["out_of_stock", "cart_has_issues"]).toContain(r.error!.message);
    }
    expect(await stock(p.variantId)).toEqual({ stock_quantity: 5, reserved_quantity: 5 });

    // Each paid order turns its reservation into a sale.
    await Promise.all(ok.map((r, i) => sb.rpc("confirm_order_payment", {
      p_order_id: r.data.id, p_provider: "razorpay", p_provider_order_id: `order_c${i}`, p_provider_payment_id: `pay_c${i}_${p.sku}`,
      p_amount: r.data.grand_total, p_currency: "INR", p_method: "upi", p_details: {},
    })));
    expect(await stock(p.variantId)).toEqual({ stock_quantity: 0, reserved_quantity: 0 });
  });

  it("never oversells cash-on-delivery orders either", async () => {
    const p = await makeProduct({ stock: 3 });
    const tokens = await Promise.all(Array.from({ length: 12 }, () => guestCart(p.variantId, 1)));
    const results = await Promise.all(tokens.map((t) => place(t, "cod")));
    expect(results.filter((r) => !r.error)).toHaveLength(3);
    expect(await stock(p.variantId)).toEqual({ stock_quantity: 0, reserved_quantity: 0 });
  });

  it("refuses to add more than is available", async () => {
    const p = await makeProduct({ stock: 2 });
    const token = guestToken();
    const res = await sb.rpc("cart_set_item", { p_user_id: null, p_token: token, p_variant_id: p.variantId, p_quantity: 3, p_mode: "add" });
    expect(res.error?.message).toBe("insufficient_stock");
  });

  it("the database itself rejects negative stock", async () => {
    const p = await makeProduct({ stock: 1 });
    await expect(sql("update public.product_variants set stock_quantity = -1 where id = $1", [p.variantId])).rejects.toThrow(/check/);
  });
});

describe("payments", () => {
  it("failed payments do not become paid orders, and expiry releases the stock", async () => {
    const p = await makeProduct({ stock: 4 });
    const token = await guestCart(p.variantId, 2);
    const placed = await place(token);
    expect(placed.error).toBeNull();
    expect(await stock(p.variantId)).toEqual({ stock_quantity: 4, reserved_quantity: 2 });

    const failed = await sb.rpc("record_payment_failure", {
      p_order_id: placed.data.id, p_provider: "razorpay", p_provider_order_id: "order_f", p_provider_payment_id: `pay_f_${p.sku}`,
      p_method: "card", p_error_code: "BAD_REQUEST_ERROR", p_error_description: "Payment declined by bank",
    });
    expect(failed.error).toBeNull();
    let [order] = await sql<{ status: string; payment_status: string }>("select status, payment_status from public.orders where id = $1", [placed.data.id]);
    expect(order).toEqual({ status: "pending_payment", payment_status: "failed" });

    await expire(placed.data.id);
    [order] = await sql("select status, payment_status from public.orders where id = $1", [placed.data.id]);
    expect(order.status).toBe("cancelled");
    expect(await stock(p.variantId)).toEqual({ stock_quantity: 4, reserved_quantity: 0 });
  });

  it("a payment that arrives after expiry reinstates the order if stock remains, else asks for a refund", async () => {
    const p = await makeProduct({ stock: 1 });
    const token = await guestCart(p.variantId, 1);
    const placed = await place(token);
    await expire(placed.data.id);

    const late = await sb.rpc("confirm_order_payment", {
      p_order_id: placed.data.id, p_provider: "razorpay", p_provider_order_id: "order_l", p_provider_payment_id: `pay_l_${p.sku}`,
      p_amount: placed.data.grand_total, p_currency: "INR", p_method: "upi", p_details: {},
    });
    expect(late.data.result).toBe("reinstated");
    expect(await stock(p.variantId)).toEqual({ stock_quantity: 0, reserved_quantity: 0 });

    // A second order for the same (now sold-out) item expires, then gets paid.
    await sql("update public.product_variants set stock_quantity = 1 where id = $1", [p.variantId]);
    const t2 = await guestCart(p.variantId, 1);
    const second = await place(t2);
    await expire(second.data.id);
    const t3 = await guestCart(p.variantId, 1);
    expect((await place(t3, "cod")).error).toBeNull();
    const tooLate = await sb.rpc("confirm_order_payment", {
      p_order_id: second.data.id, p_provider: "razorpay", p_provider_order_id: "order_l2", p_provider_payment_id: `pay_l2_${p.sku}`,
      p_amount: second.data.grand_total, p_currency: "INR", p_method: "upi", p_details: {},
    });
    expect(tooLate.data.result).toBe("refund_required");
    const [o] = await sql<{ status: string; needs_attention: boolean }>("select status, needs_attention from public.orders where id = $1", [second.data.id]);
    expect(o).toEqual({ status: "cancelled", needs_attention: true });
  });

  it("processing the same payment twice changes nothing; a second payment is flagged", async () => {
    const p = await makeProduct({ stock: 3 });
    const token = await guestCart(p.variantId, 1);
    const placed = await place(token);
    const args = {
      p_order_id: placed.data.id, p_provider: "razorpay", p_provider_order_id: "order_d", p_provider_payment_id: `pay_d_${p.sku}`,
      p_amount: placed.data.grand_total, p_currency: "INR", p_method: "card", p_details: {},
    };
    const [a, b] = await Promise.all([sb.rpc("confirm_order_payment", args), sb.rpc("confirm_order_payment", args)]);
    expect([a.data.result, b.data.result].sort()).toEqual(["already_processed", "confirmed"]);
    expect(await stock(p.variantId)).toEqual({ stock_quantity: 2, reserved_quantity: 0 });
    const payments = await sql("select 1 from public.payments where order_id = $1 and status = 'captured'", [placed.data.id]);
    expect(payments).toHaveLength(1);

    const dup = await sb.rpc("confirm_order_payment", { ...args, p_provider_payment_id: `pay_d2_${p.sku}` });
    expect(dup.data.result).toBe("duplicate_payment");
    expect(await stock(p.variantId)).toEqual({ stock_quantity: 2, reserved_quantity: 0 });
  });

  it("rejects a payment for the wrong amount", async () => {
    const p = await makeProduct({ stock: 3 });
    const placed = await place(await guestCart(p.variantId, 1));
    const res = await sb.rpc("confirm_order_payment", {
      p_order_id: placed.data.id, p_provider: "razorpay", p_provider_order_id: "order_m", p_provider_payment_id: `pay_m_${p.sku}`,
      p_amount: 100, p_currency: "INR", p_method: "card", p_details: {},
    });
    expect(res.data.result).toBe("amount_mismatch");
    const [o] = await sql<{ payment_status: string }>("select payment_status from public.orders where id = $1", [placed.data.id]);
    expect(o.payment_status).toBe("pending");
  });

  it("the same checkout submitted twice creates one order", async () => {
    const p = await makeProduct({ stock: 3 });
    const token = await guestCart(p.variantId, 1);
    const key = crypto.randomUUID();
    const args = {
      p_user_id: null, p_cart_token: token, p_idempotency_key: key, p_email: "twice@example.com", p_phone: "",
      p_shipping_address: address, p_billing_address: null, p_rate_id: null, p_payment_method: "razorpay",
    };
    const [a, b] = await Promise.all([sb.rpc("place_order", args), sb.rpc("place_order", args)]);
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    expect(a.data.id).toBe(b.data.id);
    expect(await stock(p.variantId)).toEqual({ stock_quantity: 3, reserved_quantity: 1 });
  });
});

describe("coupons", () => {
  it("respects the usage limit under concurrent checkouts", async () => {
    const code = `LIMIT${Date.now().toString().slice(-6)}`;
    await sql("insert into public.coupons (code, kind, value, usage_limit) values ($1, 'percentage', 1000, 2)", [code]);
    const p = await makeProduct({ stock: 50 });
    const tokens = await Promise.all(Array.from({ length: 6 }, () => guestCart(p.variantId, 1)));
    for (const t of tokens) {
      const r = await sb.rpc("cart_set_coupon", { p_user_id: null, p_token: t, p_code: code, p_email: null });
      expect(r.data.coupon.valid).toBe(true);
    }
    const results = await Promise.all(tokens.map((t, i) => place(t, "razorpay", `c${i}@example.com`)));
    expect(results.filter((r) => !r.error)).toHaveLength(2);
    const [{ n }] = await sql<{ n: string }>(
      "select count(*) n from public.coupon_redemptions r join public.coupons c on c.id = r.coupon_id where c.code = $1 and r.voided_at is null", [code]);
    expect(Number(n)).toBe(2);
  });

  it("first-order coupons are refused to returning customers", async () => {
    const code = `FIRST${Date.now().toString().slice(-6)}`;
    await sql("insert into public.coupons (code, kind, value, first_order_only) values ($1, 'fixed', 10000, true)", [code]);
    const p = await makeProduct({ stock: 10 });
    const user = await makeUser();
    await sb.rpc("cart_set_item", { p_user_id: user.id, p_token: null, p_variant_id: p.variantId, p_quantity: 1, p_mode: "add" });
    const first = await sb.rpc("place_order", {
      p_user_id: user.id, p_cart_token: null, p_idempotency_key: crypto.randomUUID(), p_email: user.email, p_phone: "",
      p_shipping_address: uniqueAddress(), p_billing_address: null, p_rate_id: null, p_payment_method: "cod",
    });
    expect(first.error).toBeNull();
    await sb.rpc("cart_set_item", { p_user_id: user.id, p_token: null, p_variant_id: p.variantId, p_quantity: 1, p_mode: "add" });
    const second = await sb.rpc("cart_set_coupon", { p_user_id: user.id, p_token: null, p_code: code, p_email: null });
    expect(second.data.coupon.valid).toBe(false);
    expect(second.data.coupon.message).toContain("first order");
  });
});

describe("returns and refunds", () => {
  it("restocks returned items and caps refunds at the amount paid", async () => {
    const p = await makeProduct({ stock: 5, price: 200000 });
    const user = await makeUser();
    const admin = await makeUser("admin");
    await sb.rpc("cart_set_item", { p_user_id: user.id, p_token: null, p_variant_id: p.variantId, p_quantity: 2, p_mode: "add" });
    const placed = await sb.rpc("place_order", {
      p_user_id: user.id, p_cart_token: null, p_idempotency_key: crypto.randomUUID(), p_email: user.email, p_phone: "",
      p_shipping_address: address, p_billing_address: null, p_rate_id: null, p_payment_method: "razorpay",
    });
    const orderId = placed.data.id;
    await sb.rpc("confirm_order_payment", {
      p_order_id: orderId, p_provider: "razorpay", p_provider_order_id: "order_r", p_provider_payment_id: `pay_r_${p.sku}`,
      p_amount: placed.data.grand_total, p_currency: "INR", p_method: "upi", p_details: {},
    });
    expect(await stock(p.variantId)).toEqual({ stock_quantity: 3, reserved_quantity: 0 });

    // Not delivered yet: no returns.
    const [item] = await sql<{ id: string }>("select id from public.order_items where order_id = $1", [orderId]);
    const early = await sb.rpc("customer_request_return", { p_order_id: orderId, p_user_id: user.id, p_items: [{ order_item_id: item.id, quantity: 1 }], p_reason: "Too big", p_details: "" });
    expect(early.error?.message).toBe("not_delivered");

    expect((await admin.client.rpc("admin_set_fulfillment", { p_order_id: orderId, p_status: "shipped", p_carrier: "Delhivery", p_tracking_number: "DL123" })).error).toBeNull();
    expect((await admin.client.rpc("admin_set_fulfillment", { p_order_id: orderId, p_status: "delivered" })).error).toBeNull();
    const back = await admin.client.rpc("admin_set_fulfillment", { p_order_id: orderId, p_status: "packed" });
    expect(back.error?.message).toBe("invalid_transition");

    // Someone else cannot request a return on this order.
    const stranger = await makeUser();
    const hijack = await sb.rpc("customer_request_return", { p_order_id: orderId, p_user_id: stranger.id, p_items: [{ order_item_id: item.id, quantity: 1 }], p_reason: "x", p_details: "" });
    expect(hijack.error?.message).toBe("order_not_found");

    const req = await sb.rpc("customer_request_return", { p_order_id: orderId, p_user_id: user.id, p_items: [{ order_item_id: item.id, quantity: 1 }], p_reason: "Too big", p_details: "" });
    expect(req.error).toBeNull();
    expect((await admin.client.rpc("admin_update_return", { p_request_id: req.data, p_action: "approve" })).error).toBeNull();
    const received = await admin.client.rpc("admin_update_return", { p_request_id: req.data, p_action: "receive", p_restock: true });
    expect(received.error).toBeNull();
    expect(await stock(p.variantId)).toEqual({ stock_quantity: 4, reserved_quantity: 0 });

    const tooMuch = await admin.client.rpc("admin_begin_refund", { p_order_id: orderId, p_amount: placed.data.grand_total + 1, p_reason: "x" });
    expect(tooMuch.error?.message).toBe("refund_too_large");
    const refund = await admin.client.rpc("admin_begin_refund", { p_order_id: orderId, p_amount: 200000, p_reason: "Return", p_return_request_id: req.data });
    expect(refund.error).toBeNull();
    expect(refund.data.needs_provider_call).toBe(true);
    const done = await sb.rpc("complete_refund", { p_refund_id: refund.data.refund_id, p_provider_refund_id: `rfnd_${p.sku}`, p_status: "processed", p_error: null });
    expect(done.error).toBeNull();
    const [o] = await sql<{ payment_status: string; amount_refunded: string }>("select payment_status, amount_refunded from public.orders where id = $1", [orderId]);
    expect(o.payment_status).toBe("partially_refunded");
    expect(Number(o.amount_refunded)).toBe(200000);
  });
});
