// Acceptance test 6 (security): customers cannot reach admin data or operations, see
// other customers' orders or addresses, change prices or payment status, or grant
// themselves a role. Everything goes through the public API with real sessions.
import { beforeAll, describe, expect, it } from "vitest";
import { address, anon, guestToken, makeProduct, makeUser, service, sql, uniqueAddress, type TestUser } from "./helpers";

let alice: TestUser;
let bob: TestUser;
let staff: TestUser;
let admin: TestUser;
let product: Awaited<ReturnType<typeof makeProduct>>;
let draft: Awaited<ReturnType<typeof makeProduct>>;
let bobOrderId: string;

beforeAll(async () => {
  [alice, bob, staff, admin] = await Promise.all([
    makeUser(undefined, "Alice Customer"),
    makeUser(undefined, "Bob Customer"),
    makeUser("staff", "Sam Staff"),
    makeUser("admin", "Ada Admin"),
  ]);
  product = await makeProduct({ stock: 20, price: 150000 });
  draft = await makeProduct({ status: "draft" });

  // Bob places a cash-on-delivery order through the server-only checkout function.
  const sb = service();
  const add = await sb.rpc("cart_set_item", { p_user_id: bob.id, p_token: null, p_variant_id: product.variantId, p_quantity: 1, p_mode: "add" });
  expect(add.error).toBeNull();
  const placed = await sb.rpc("place_order", {
    p_user_id: bob.id, p_cart_token: null, p_idempotency_key: crypto.randomUUID(), p_email: bob.email, p_phone: "",
    p_shipping_address: uniqueAddress(), p_billing_address: null, p_rate_id: null, p_payment_method: "cod",
  });
  expect(placed.error).toBeNull();
  bobOrderId = placed.data.id;
  await bob.client.from("customer_addresses").insert({ ...address, user_id: bob.id });
});

describe("anonymous visitors", () => {
  it("see published products but not drafts", async () => {
    const { data } = await anon().from("products").select("id, slug").in("id", [product.productId, draft.productId]);
    expect(data?.map((p) => p.id)).toEqual([product.productId]);
    const page = await anon().rpc("get_product_page", { p_slug: draft.slug });
    expect(page.data).toBeNull();
  });

  it("cannot read customer, order or payment data", async () => {
    for (const table of ["orders", "order_items", "profiles", "customer_addresses", "payments", "audit_logs", "carts", "user_roles", "coupons", "refunds"]) {
      const { data, error } = await anon().from(table).select("*").limit(5);
      expect(error !== null || (data ?? []).length === 0, `${table} leaked to anon`).toBe(true);
    }
  });

  it("cannot write the catalog", async () => {
    const { error } = await anon().from("products").insert({ title: "Hack", slug: "hack", price: 1 });
    expect(error).not.toBeNull();
    const upd = await anon().from("products").update({ price: 1 }).eq("id", product.productId).select();
    expect(upd.data ?? []).toHaveLength(0);
  });

  it("cannot call server-only checkout and payment functions", async () => {
    const calls: [string, Record<string, unknown>][] = [
      ["place_order", { p_user_id: null, p_cart_token: guestToken(), p_idempotency_key: crypto.randomUUID(), p_email: "x@example.com", p_phone: "+91 9876543210", p_shipping_address: address, p_billing_address: null, p_rate_id: null, p_payment_method: "cod" }],
      ["confirm_order_payment", { p_order_id: bobOrderId, p_provider: "razorpay", p_provider_order_id: "order_x", p_provider_payment_id: "pay_x", p_amount: 1, p_currency: "INR", p_method: "upi", p_details: {} }],
      ["cart_set_item", { p_user_id: bob.id, p_token: null, p_variant_id: product.variantId, p_quantity: 5, p_mode: "add" }],
      ["bootstrap_owner", { p_email: alice.email }],
      ["release_expired_orders", { p_limit: 10 }],
      ["rate_limit_hit", { p_key: "x", p_max: 1, p_window_seconds: 60 }],
      ["complete_refund", { p_refund_id: crypto.randomUUID(), p_provider_refund_id: "rfnd_x", p_status: "processed", p_error: null }],
    ];
    for (const [fn, args] of calls) {
      const { error } = await anon().rpc(fn, args);
      expect(error, `${fn} was callable by anon`).not.toBeNull();
    }
  });

  it("cannot upload to the catalog bucket", async () => {
    const { error } = await anon().storage.from("catalog").upload(`hack-${Date.now()}.png`, new Blob(["x"], { type: "image/png" }));
    expect(error).not.toBeNull();
  });
});

describe("customers", () => {
  it("can edit their own profile but not see anyone else's", async () => {
    const upd = await alice.client.from("profiles").update({ full_name: "Alice R." }).eq("id", alice.id).select("full_name");
    expect(upd.error).toBeNull();
    expect(upd.data?.[0].full_name).toBe("Alice R.");
    const other = await alice.client.from("profiles").select("id").eq("id", bob.id);
    expect(other.data ?? []).toHaveLength(0);
  });

  it("cannot grant themselves a staff role", async () => {
    const ins = await alice.client.from("user_roles").insert({ user_id: alice.id, role: "owner" });
    expect(ins.error).not.toBeNull();
    const grant = await alice.client.rpc("grant_role", { p_email: alice.email, p_role: "owner" });
    expect(grant.error).not.toBeNull();
    const boot = await alice.client.rpc("bootstrap_owner", { p_email: alice.email });
    expect(boot.error).not.toBeNull();
    // Profiles have no role column, and other profile columns are not writable.
    const sneaky = await alice.client.from("profiles").update({ email: "owner@example.com" }).eq("id", alice.id);
    expect(sneaky.error).not.toBeNull();
    const role = await alice.client.rpc("is_staff");
    expect(role.data).toBe(false);
  });

  it("cannot see other customers' orders or addresses", async () => {
    const orders = await alice.client.from("orders").select("id").eq("id", bobOrderId);
    expect(orders.data ?? []).toHaveLength(0);
    const items = await alice.client.from("order_items").select("id").eq("order_id", bobOrderId);
    expect(items.data ?? []).toHaveLength(0);
    const addresses = await alice.client.from("customer_addresses").select("id").eq("user_id", bob.id);
    expect(addresses.data ?? []).toHaveLength(0);
    // ...while Bob sees his own.
    const own = await bob.client.from("orders").select("id, order_number, grand_total").eq("id", bobOrderId);
    expect(own.data).toHaveLength(1);
  });

  it("cannot create addresses for someone else", async () => {
    const { error } = await alice.client.from("customer_addresses").insert({ ...address, user_id: bob.id });
    expect(error).not.toBeNull();
  });

  it("cannot change prices, stock reservations or payment status", async () => {
    const price = await alice.client.from("products").update({ price: 100 }).eq("id", product.productId).select();
    expect(price.data ?? []).toHaveLength(0);
    const variantPrice = await alice.client.from("product_variants").update({ price: 100 }).eq("id", product.variantId).select();
    expect(variantPrice.data ?? []).toHaveLength(0);
    const reserved = await alice.client.from("product_variants").update({ reserved_quantity: 0 }).eq("id", product.variantId);
    expect(reserved.error).not.toBeNull();
    const paid = await bob.client.from("orders").update({ payment_status: "paid" }).eq("id", bobOrderId);
    expect(paid.error).not.toBeNull();
    const [row] = await sql<{ price: string; payment_status: string }>(
      "select p.price, o.payment_status from public.products p, public.orders o where p.id = $1 and o.id = $2",
      [product.productId, bobOrderId],
    );
    expect(Number(row.price)).toBe(150000);
    expect(row.payment_status).toBe("unpaid");
  });

  it("cannot call admin operations", async () => {
    const calls: [string, Record<string, unknown>][] = [
      ["admin_save_product", { p: { title: "X", price: 1, variants: [{ sku: "HACK-1" }] } }],
      ["admin_set_fulfillment", { p_order_id: bobOrderId, p_status: "shipped", p_carrier: "X" }],
      ["admin_dashboard", { p_days: 30 }],
      ["admin_begin_refund", { p_order_id: bobOrderId, p_amount: 100, p_reason: "x" }],
      ["admin_mark_cod_paid", { p_order_id: bobOrderId, p_reference: "x" }],
      ["admin_set_stock", { p_items: [{ variant_id: product.variantId, quantity: 0 }], p_reason: "adjustment", p_note: "" }],
      ["admin_delete_sample_data", {}],
    ];
    for (const [fn, args] of calls) {
      const { error } = await alice.client.rpc(fn, args);
      expect(error, `${fn} was callable by a customer`).not.toBeNull();
    }
    const customers = await alice.client.rpc("admin_customers", { p_q: null });
    expect(customers.data ?? []).toHaveLength(0);
  });

  it("cannot read payment records, even for their own order", async () => {
    const { data } = await bob.client.from("payments").select("id").eq("order_id", bobOrderId);
    expect(data ?? []).toHaveLength(0);
  });

  it("cannot upload catalog images", async () => {
    const { error } = await alice.client.storage.from("catalog").upload(`hack-${Date.now()}.png`, new Blob(["x"], { type: "image/png" }));
    expect(error).not.toBeNull();
  });
});

describe("staff", () => {
  it("can see every order and manage the catalog", async () => {
    const orders = await staff.client.from("orders").select("id").eq("id", bobOrderId);
    expect(orders.data).toHaveLength(1);
    const saved = await staff.client.rpc("admin_save_product", {
      p: { title: `Staff product ${Date.now()}`, price: 99900, status: "draft", variants: [{ sku: `STAFF-${Date.now()}`, size: "M", stock_quantity: 3 }] },
    });
    expect(saved.error).toBeNull();
  });

  it("can upload catalog images", async () => {
    const path = `tests/staff-${Date.now()}.png`;
    const { error } = await staff.client.storage.from("catalog").upload(path, new Blob(["x"], { type: "image/png" }));
    expect(error).toBeNull();
    await staff.client.storage.from("catalog").remove([path]);
  });

  it("cannot refund, collect cash or manage roles", async () => {
    const cod = await staff.client.rpc("admin_mark_cod_paid", { p_order_id: bobOrderId, p_reference: "x" });
    expect(cod.error).not.toBeNull();
    const refund = await staff.client.rpc("admin_begin_refund", { p_order_id: bobOrderId, p_amount: 100, p_reason: "x" });
    expect(refund.error).not.toBeNull();
    const grant = await staff.client.rpc("grant_role", { p_email: alice.email, p_role: "staff" });
    expect(grant.error).not.toBeNull();
    const payments = await staff.client.from("payments").select("id").limit(1);
    expect(payments.data ?? []).toHaveLength(0);
  });
});

describe("admins and owners", () => {
  it("admins can collect cash on delivery and read payments", async () => {
    const cod = await admin.client.rpc("admin_mark_cod_paid", { p_order_id: bobOrderId, p_reference: "COD-RECEIPT-1" });
    expect(cod.error).toBeNull();
    expect(cod.data.payment_status).toBe("paid");
    const payments = await admin.client.from("payments").select("provider, amount").eq("order_id", bobOrderId);
    expect(payments.data?.[0].provider).toBe("cod");
  });

  it("owners grant and revoke roles, but the last owner cannot be removed", async () => {
    const owner = await makeUser("owner", "Olive Owner");
    const grant = await owner.client.rpc("grant_role", { p_email: alice.email, p_role: "staff" });
    expect(grant.error).toBeNull();
    expect((await alice.client.rpc("is_staff")).data).toBe(true);
    const revoke = await owner.client.rpc("revoke_role", { p_user_id: alice.id });
    expect(revoke.error).toBeNull();
    expect((await alice.client.rpc("is_staff")).data).toBe(false);

    const owners = await sql<{ n: string }>("select count(*) n from public.user_roles where role = 'owner'");
    if (Number(owners[0].n) === 1) {
      const self = await owner.client.rpc("revoke_role", { p_user_id: owner.id });
      expect(self.error?.message).toContain("last_owner");
    }
  });

  it("role changes are audited", async () => {
    const rows = await sql("select 1 from public.audit_logs where entity_type = 'user_roles' and entity_id = $1", [alice.id]);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});
