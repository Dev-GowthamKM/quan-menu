// WhatsApp order updates at the database level: messages are queued only for customers who
// opted in at checkout and only for events the store has a template for; customers can
// switch them off; only the server can queue or claim them.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { address, guestToken, makeProduct, makeUser, service, sql, uniquePhone, type TestUser } from "./helpers";

const sb = service();
let staff: TestUser;
let customer: TestUser;
let before: { whatsapp_enabled: boolean; whatsapp_templates: unknown };
let lastPhone = "";

beforeAll(async () => {
  [staff, customer] = await Promise.all([makeUser("staff"), makeUser()]);
  [before] = await sql("select whatsapp_enabled, whatsapp_templates from public.store_settings where id = 1");
  await sql(`update public.store_settings set whatsapp_enabled = true,
    whatsapp_templates = '{"order_confirmation": {"name": "order_confirmed", "language": "en"}, "order_shipped": {"name": "order_shipped", "language": "en"}}'
    where id = 1`);
});

afterAll(async () => {
  await sql("update public.store_settings set whatsapp_enabled = $1, whatsapp_templates = $2 where id = 1", [before.whatsapp_enabled, before.whatsapp_templates]);
});

async function codOrder(optIn: boolean) {
  const p = await makeProduct({ stock: 5 });
  const token = guestToken();
  await sb.rpc("cart_set_item", { p_user_id: null, p_token: token, p_variant_id: p.variantId, p_quantity: 1, p_mode: "add" });
  const contact = await sb.rpc("cart_set_contact", { p_user_id: null, p_token: token, p_contact: { whatsapp_opt_in: optIn } });
  expect(contact.error).toBeNull();
  const phone = uniquePhone();
  const placed = await sb.rpc("place_order", {
    p_user_id: null, p_cart_token: token, p_idempotency_key: randomUUID(), p_email: `wa-${p.sku.toLowerCase()}@example.com`, p_phone: phone,
    p_shipping_address: { ...address, phone }, p_billing_address: null, p_rate_id: null, p_payment_method: "cod",
  });
  expect(placed.error).toBeNull();
  lastPhone = phone;
  return placed.data.id as string;
}

const messages = (orderId: string) =>
  sql<{ template: string; status: string; to_phone: string }>("select template, status, to_phone from public.whatsapp_outbox where order_id = $1 order by created_at", [orderId]);

describe("WhatsApp order updates", () => {
  it("are queued with the email only for customers who opted in at checkout", async () => {
    const yes = await codOrder(true);
    const yesPhone = lastPhone;
    const no = await codOrder(false);
    const [{ whatsapp_opt_in }] = await sql<{ whatsapp_opt_in: boolean }>("select whatsapp_opt_in from public.orders where id = $1", [yes]);
    expect(whatsapp_opt_in).toBe(true);
    expect(await messages(yes)).toEqual([{ template: "order_confirmation", status: "queued", to_phone: yesPhone }]);
    expect(await messages(no)).toEqual([]);
    const [{ n }] = await sql<{ n: number }>("select count(*)::int as n from public.email_outbox where order_id = $1", [no]);
    expect(n).toBe(1);
  });

  it("only go out for events the store has a template for", async () => {
    const id = await codOrder(true);
    expect((await staff.client.rpc("admin_set_fulfillment", { p_order_id: id, p_status: "shipped", p_carrier: "Delhivery", p_tracking_number: "DL1" })).error).toBeNull();
    expect((await staff.client.rpc("admin_set_fulfillment", { p_order_id: id, p_status: "delivered" })).error).toBeNull();
    // order_delivered has no template, so only the confirmation and the shipping update are queued.
    expect((await messages(id)).map((m) => m.template)).toEqual(["order_confirmation", "order_shipped"]);
  });

  it("stop when the customer turns them off, including messages still waiting", async () => {
    const id = await codOrder(true);
    expect((await sb.rpc("set_order_whatsapp", { p_order_id: id, p_on: false })).error).toBeNull();
    expect((await messages(id)).map((m) => m.status)).toEqual(["skipped"]);
    await staff.client.rpc("admin_set_fulfillment", { p_order_id: id, p_status: "shipped", p_carrier: "Delhivery", p_tracking_number: "DL2" });
    expect(await messages(id)).toHaveLength(1);
  });

  it("are handed to one sender at a time", async () => {
    await codOrder(true);
    await codOrder(true);
    const [a, b] = await Promise.all([sb.rpc("claim_whatsapp_outbox", { p_limit: 100 }), sb.rpc("claim_whatsapp_outbox", { p_limit: 100 })]);
    const ids = [...(a.data ?? []), ...(b.data ?? [])].map((r: { id: string }) => r.id);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("can't be queued, claimed or switched by customers", async () => {
    const id = await codOrder(true);
    expect((await customer.client.rpc("claim_whatsapp_outbox", { p_limit: 10 })).error).not.toBeNull();
    expect((await customer.client.rpc("set_order_whatsapp", { p_order_id: id, p_on: false })).error).not.toBeNull();
    expect((await customer.client.rpc("cart_set_contact", { p_user_id: customer.id, p_token: null, p_contact: { whatsapp_opt_in: true } })).error).not.toBeNull();
    expect((await customer.client.from("whatsapp_outbox").select("id")).data).toEqual([]);
  });
});
