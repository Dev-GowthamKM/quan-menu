// Reminders at the database level: back-in-stock requests and the email when a size
// returns, one reminder about a bag left behind (and restoring it elsewhere), wishlist
// price drops for customers who opted in, and unsubscribing.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guestToken, makeProduct, makeUser, service, sql, uniqueEmail, type TestUser } from "./helpers";

const sb = service();
let customer: TestUser;
let before: Record<string, unknown>;

beforeAll(async () => {
  customer = await makeUser();
  [before] = await sql("select stock_alerts_enabled, cart_reminders_enabled, cart_reminder_hours, price_alerts_enabled from public.store_settings where id = 1");
  await sql("update public.store_settings set stock_alerts_enabled = true, cart_reminders_enabled = true, cart_reminder_hours = 1, price_alerts_enabled = true where id = 1");
});

afterAll(async () => {
  await sql("update public.store_settings set stock_alerts_enabled = $1, cart_reminders_enabled = $2, cart_reminder_hours = $3, price_alerts_enabled = $4 where id = 1",
    [before.stock_alerts_enabled, before.cart_reminders_enabled, before.cart_reminder_hours, before.price_alerts_enabled]);
});

const outbox = (email: string, template: string) =>
  sql<{ data: Record<string, unknown> }>("select data from public.email_outbox where to_email = $1 and template = $2 order by created_at", [email.toLowerCase(), template]);

async function cartOf(token: string) {
  const [row] = await sql<{ id: string }>("select id from public.carts where token_hash = encode(extensions.digest($1, 'sha256'), 'hex')", [token]);
  return row.id;
}

describe("back in stock", () => {
  it("takes requests only for sold-out sizes, once per email", async () => {
    const soldOut = await makeProduct({ stock: 0 });
    const email = uniqueEmail("alert");
    const first = await sb.rpc("stock_alert_subscribe", { p_variant_id: soldOut.variantId, p_email: email.toUpperCase() });
    expect(first.data).toMatchObject({ in_stock: false, size: "M", color: "Black" });
    await sb.rpc("stock_alert_subscribe", { p_variant_id: soldOut.variantId, p_email: email });
    const [{ n }] = await sql<{ n: number }>("select count(*)::int as n from public.stock_alerts where variant_id = $1", [soldOut.variantId]);
    expect(n).toBe(1);
    const inStock = await makeProduct({ stock: 3 });
    expect((await sb.rpc("stock_alert_subscribe", { p_variant_id: inStock.variantId, p_email: email })).data).toEqual({ in_stock: true });
    expect((await sb.rpc("stock_alert_subscribe", { p_variant_id: soldOut.variantId, p_email: "not-an-email" })).error?.message).toBe("invalid_email");
  });

  it("emails everyone waiting once when the size comes back (they asked, so even after unsubscribing from reminders)", async () => {
    const p = await makeProduct({ stock: 0 });
    const [a, b] = [uniqueEmail("wait"), uniqueEmail("wait")];
    await sb.rpc("stock_alert_subscribe", { p_variant_id: p.variantId, p_email: a });
    await sb.rpc("stock_alert_subscribe", { p_variant_id: p.variantId, p_email: b });
    await sb.rpc("email_unsubscribe", { p_email: b });
    await sql("update public.product_variants set stock_quantity = 2 where id = $1", [p.variantId]);
    const mails = await outbox(a, "back_in_stock");
    expect(mails).toHaveLength(1);
    expect(mails[0].data).toMatchObject({ product_title: `Test ${p.slug}`, slug: p.slug, size: "M", color: "Black" });
    expect(await outbox(b, "back_in_stock")).toHaveLength(1);
    // Selling out and coming back again doesn't email them twice.
    await sql("update public.product_variants set stock_quantity = 0 where id = $1", [p.variantId]);
    await sql("update public.product_variants set stock_quantity = 4 where id = $1", [p.variantId]);
    expect(await outbox(a, "back_in_stock")).toHaveLength(1);
  });

  it("can't be read or requested by customers directly", async () => {
    const p = await makeProduct({ stock: 0 });
    expect((await customer.client.rpc("stock_alert_subscribe", { p_variant_id: p.variantId, p_email: customer.email })).error).not.toBeNull();
    expect((await customer.client.from("stock_alerts").select("id")).data).toEqual([]);
  });
});

describe("a bag left behind", () => {
  it("gets one reminder, once it has sat untouched long enough", async () => {
    const p = await makeProduct({ stock: 5 });
    const token = guestToken();
    await sb.rpc("cart_set_item", { p_user_id: null, p_token: token, p_variant_id: p.variantId, p_quantity: 2, p_mode: "add" });
    const email = uniqueEmail("bag");
    await sb.rpc("cart_set_contact", { p_user_id: null, p_token: token, p_contact: { email } });
    await sb.rpc("queue_cart_reminders", { p_limit: 1000 });
    expect(await outbox(email, "cart_reminder")).toHaveLength(0);

    const cartId = await cartOf(token);
    await sql("update public.carts set updated_at = now() - interval '2 hours' where id = $1", [cartId]);
    await sb.rpc("queue_cart_reminders", { p_limit: 1000 });
    const mails = await outbox(email, "cart_reminder");
    expect(mails).toHaveLength(1);
    expect(mails[0].data.cart_id).toBe(cartId);
    expect(mails[0].data.items).toEqual([expect.objectContaining({ title: `Test ${p.slug}`, quantity: 2, size: "M" })]);
    await sb.rpc("queue_cart_reminders", { p_limit: 1000 });
    expect(await outbox(email, "cart_reminder")).toHaveLength(1);
  });

  it("isn't sent to someone who unsubscribed", async () => {
    const p = await makeProduct({ stock: 5 });
    const token = guestToken();
    await sb.rpc("cart_set_item", { p_user_id: null, p_token: token, p_variant_id: p.variantId, p_quantity: 1, p_mode: "add" });
    const email = uniqueEmail("nope");
    await sb.rpc("cart_set_contact", { p_user_id: null, p_token: token, p_contact: { email } });
    await sb.rpc("email_unsubscribe", { p_email: email });
    await sql("update public.carts set updated_at = now() - interval '2 hours' where id = $1", [await cartOf(token)]);
    await sb.rpc("queue_cart_reminders", { p_limit: 1000 });
    expect(await outbox(email, "cart_reminder")).toHaveLength(0);
  });

  it("is restored in another browser, as far as stock allows", async () => {
    const [shirt, scarf] = await Promise.all([makeProduct({ stock: 5 }), makeProduct({ stock: 2 })]);
    const token = guestToken();
    await sb.rpc("cart_set_item", { p_user_id: null, p_token: token, p_variant_id: shirt.variantId, p_quantity: 2, p_mode: "add" });
    await sb.rpc("cart_set_item", { p_user_id: null, p_token: token, p_variant_id: scarf.variantId, p_quantity: 1, p_mode: "add" });
    await sql("update public.product_variants set stock_quantity = 0 where id = $1", [scarf.variantId]);
    const other = guestToken();
    const { data: added } = await sb.rpc("cart_restore", { p_from_cart: await cartOf(token), p_user_id: null, p_token: other });
    expect(added).toBe(1);
    const items = await sql<{ variant_id: string; quantity: number }>("select variant_id, quantity from public.cart_items where cart_id = $1", [await cartOf(other)]);
    expect(items).toEqual([{ variant_id: shirt.variantId, quantity: 2 }]);
  });
});

describe("wishlist price drops", () => {
  it("email customers who opted in when a saved product is at least 5% cheaper, once per drop", async () => {
    const user = await makeUser();
    const p = await makeProduct({ stock: 5, price: 200000 });
    expect((await user.client.rpc("toggle_wishlist", { p_product_id: p.productId })).data).toBe(true);
    const [{ price_at_add }] = await sql<{ price_at_add: string }>("select price_at_add from public.wishlist_items where product_id = $1", [p.productId]);
    expect(Number(price_at_add)).toBe(200000);

    await sql("update public.products set price = 180000 where id = $1", [p.productId]);
    await sb.rpc("queue_price_alerts", { p_limit: 1000 });
    expect(await outbox(user.email, "price_drop")).toHaveLength(0); // not opted in yet

    expect((await user.client.from("profiles").update({ price_alerts: true }).eq("id", user.id)).error).toBeNull();
    await sql("update public.products set price = 196000 where id = $1", [p.productId]); // 2% below: not enough
    await sb.rpc("queue_price_alerts", { p_limit: 1000 });
    expect(await outbox(user.email, "price_drop")).toHaveLength(0);

    await sql("update public.products set price = 170000 where id = $1", [p.productId]);
    await sb.rpc("queue_price_alerts", { p_limit: 1000 });
    const mails = await outbox(user.email, "price_drop");
    expect(mails).toHaveLength(1);
    expect(mails[0].data.items).toEqual([expect.objectContaining({ title: `Test ${p.slug}`, was: 200000, now: 170000 })]);
    await sb.rpc("queue_price_alerts", { p_limit: 1000 });
    expect(await outbox(user.email, "price_drop")).toHaveLength(1);
  });

  it("unsubscribing turns them off; customers can't run the jobs themselves", async () => {
    const user = await makeUser();
    await user.client.from("profiles").update({ price_alerts: true }).eq("id", user.id);
    await sb.rpc("email_unsubscribe", { p_email: user.email.toUpperCase() });
    const [row] = await sql<{ price_alerts: boolean }>("select price_alerts from public.profiles where id = $1", [user.id]);
    expect(row.price_alerts).toBe(false);
    for (const fn of ["queue_price_alerts", "queue_cart_reminders"] as const) {
      expect((await customer.client.rpc(fn, { p_limit: 10 })).error).not.toBeNull();
    }
    expect((await customer.client.rpc("email_unsubscribe", { p_email: user.email })).error).not.toBeNull();
    expect((await customer.client.from("email_suppressions").select("email")).data).toEqual([]);
  });
});
