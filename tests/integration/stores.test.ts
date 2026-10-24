// Multi-store: one platform, many stores. Every store's catalog, customers, orders,
// settings, staff, keys and images stay its own, whatever the caller sends as the store
// header (which only chooses the store, never grants anything).
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { guestToken, homeStoreId, makeProduct, makeUser, service, signedInAt, sql, storeClient, uniqueAddress, uniqueEmail, type TestUser } from "./helpers";

let home: string;
let platformAdmin: TestUser;
let store: { id: string; slug: string; host: string; prefix: string };
let storeOwner: TestUser;

const letters = () => Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");

async function createStore(name: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = `s-${randomUUID().slice(0, 8)}`;
    const prefix = letters();
    const host = `${slug}.localhost:3000`;
    const { data, error } = await platformAdmin.client.rpc("platform_create_store", { p: { name, slug, order_prefix: prefix, hostname: host } });
    if (!error) return { id: data as string, slug, host, prefix };
    if (!/duplicate_prefix/.test(error.message)) throw error;
  }
  throw new Error("Couldn't pick a free order prefix.");
}

/** A visible product with one variant in the given store. */
async function productIn(storeId: string, slug = `p-${randomUUID().slice(0, 8)}`) {
  const [product] = await sql<{ id: string }>(
    "insert into public.products (store_id, title, slug, price, status) values ($1, $2, $3, 150000, 'active') returning id",
    [storeId, `Product ${slug}`, slug],
  );
  const [variant] = await sql<{ id: string }>(
    "insert into public.product_variants (product_id, sku, size, color, stock_quantity) values ($1, $2, 'M', 'Blue', 10) returning id",
    [product.id, `S-${randomUUID().slice(0, 8).toUpperCase()}`],
  );
  return { productId: product.id, variantId: variant.id, slug };
}

beforeAll(async () => {
  home = await homeStoreId();
  platformAdmin = await makeUser("owner", "Platform Admin");
  await sql("insert into public.platform_admins (user_id) values ($1)", [platformAdmin.id]);
  store = await createStore("Second Store");
  storeOwner = await makeUser(undefined, "Second Owner");
  await sql("insert into public.user_roles (store_id, user_id, role) values ($1, $2, 'owner')", [store.id, storeOwner.id]);
});

describe("the platform", () => {
  it("lets only its administrators create stores", async () => {
    const owner = await makeUser("owner");
    const { error } = await owner.client.rpc("platform_create_store", { p: { name: "Sneaky", slug: `x-${randomUUID().slice(0, 6)}`, order_prefix: "ZZQ" } });
    expect(error?.message).toBe("forbidden");
  });

  it("sets a new store up with its owner, settings, delivery and order numbers", async () => {
    const [row] = await sql<{ store_name: string; zones: string; rates: string; couriers: string; owner: string }>(
      `select s.store_name,
              (select count(*) from public.shipping_zones z where z.store_id = s.store_id) as zones,
              (select count(*) from public.shipping_rates r where r.store_id = s.store_id) as rates,
              (select count(*) from public.shipping_providers p where p.store_id = s.store_id) as couriers,
              (select r.role::text from public.user_roles r where r.store_id = s.store_id and r.user_id = $2) as owner
       from public.store_settings s where s.store_id = $1`,
      [store.id, platformAdmin.id],
    );
    expect(row).toMatchObject({ store_name: "Second Store", zones: "1", rates: "2", couriers: "7", owner: "owner" });
  });

  it("opens a store at its own web address, and the home store anywhere else", async () => {
    const anonymous = service();
    const own = await anonymous.rpc("resolve_store", { p_host: store.host });
    expect(own.data).toMatchObject({ id: store.id, is_home: false, primary_host: store.host });
    const other = await anonymous.rpc("resolve_store", { p_host: "unknown.example.com" });
    expect(other.data).toMatchObject({ id: home, is_home: true });
  });
});

describe("catalogs", () => {
  it("show each store only its own products, even with the same address", async () => {
    const slug = `same-${randomUUID().slice(0, 8)}`;
    const a = await productIn(home, slug);
    const b = await productIn(store.id, slug);
    for (const [id, expected] of [[home, a.productId], [store.id, b.productId]] as const) {
      const client = storeClient(id);
      const rows = await client.from("products").select("id").eq("slug", slug);
      expect(rows.data?.map((r) => r.id)).toEqual([expected]);
      const page = await client.rpc("get_product_page", { p_slug: slug });
      expect((page.data as { id: string }).id).toBe(expected);
      const search = await client.rpc("search_products", { p_q: slug, p_limit: 10, p_offset: 0 });
      expect((search.data as { id: string }[]).map((r) => r.id)).toEqual([expected]);
    }
  });
});

describe("staff", () => {
  it("of one store can't read or change another store", async () => {
    const homeAdmin = await makeUser("admin");
    const there = await signedInAt(homeAdmin, store.id);
    expect((await there.rpc("my_role")).data).toBeNull();
    expect((await there.rpc("admin_dashboard", { p_days: 30 })).error).not.toBeNull();
    await there.from("store_settings").update({ store_name: "Hijacked" }).eq("store_id", store.id);
    const [s] = await sql<{ store_name: string }>("select store_name from public.store_settings where store_id = $1", [store.id]);
    expect(s.store_name).toBe("Second Store");
    const insert = await there.from("products").insert({ title: "Planted", slug: `planted-${randomUUID().slice(0, 6)}`, price: 1000 });
    expect(insert.error).not.toBeNull();
    // Their own store is unaffected.
    expect((await homeAdmin.client.rpc("my_role")).data).toBe("admin");
  });

  it("can't move a row into another store or reach it by naming the other store", async () => {
    const b = await productIn(store.id);
    const own = await signedInAt(storeOwner, store.id);
    const move = await own.from("products").update({ store_id: home }).eq("id", b.productId).select("id");
    expect(move.error).not.toBeNull();
    const elsewhere = await signedInAt(storeOwner, home);
    const edit = await elsewhere.from("products").update({ title: "Changed" }).eq("id", b.productId).select("id");
    expect(edit.data ?? []).toEqual([]);
    const [p] = await sql<{ store_id: string; title: string }>("select store_id, title from public.products where id = $1", [b.productId]);
    expect(p).toEqual({ store_id: store.id, title: `Product ${b.slug}` });
  });

  it("see only their own store's customers", async () => {
    const shopper = await service().auth.admin.createUser({ email: uniqueEmail("joined"), password: `pw-${randomUUID()}`, email_confirm: true, user_metadata: { full_name: "Joined There", store_id: store.id } });
    const id = shopper.data.user!.id;
    const own = await signedInAt(storeOwner, store.id);
    const ours = await own.rpc("admin_customers", { p_q: "Joined There", p_limit: 50, p_offset: 0 });
    expect((ours.data as { id: string }[]).map((r) => r.id)).toContain(id);
    const homeAdmin = await makeUser("admin");
    const theirs = await homeAdmin.client.rpc("admin_customers", { p_q: "Joined There", p_limit: 50, p_offset: 0 });
    expect((theirs.data as { id: string }[]).map((r) => r.id)).not.toContain(id);
  });
});

describe("the server's own access", () => {
  it("is held to the store a call names", async () => {
    const a = await makeProduct();
    const wrong = await storeClient(store.id, "service").from("products").update({ title: "Wrong store" }).eq("id", a.productId);
    expect(wrong.error?.message).toBe("wrong_store");
    const right = await storeClient(home, "service").from("products").update({ title: "Right store" }).eq("id", a.productId);
    expect(right.error).toBeNull();
  });
});

describe("shopping", () => {
  it("keeps each bag to its own store's items", async () => {
    const a = await makeProduct();
    const res = await storeClient(store.id, "service").rpc("cart_set_item", { p_user_id: null, p_token: guestToken(), p_variant_id: a.variantId, p_quantity: 1, p_mode: "add" });
    expect(res.error).not.toBeNull();
  });

  it("places orders with the store's own numbers, and only its staff see them", async () => {
    const b = await productIn(store.id);
    const sb = storeClient(store.id, "service");
    const token = guestToken();
    expect((await sb.rpc("cart_set_item", { p_user_id: null, p_token: token, p_variant_id: b.variantId, p_quantity: 1, p_mode: "add" })).error).toBeNull();
    const placed = await sb.rpc("place_order", {
      p_user_id: null, p_cart_token: token, p_idempotency_key: randomUUID(), p_email: uniqueEmail(), p_phone: "",
      p_shipping_address: uniqueAddress(), p_billing_address: null, p_rate_id: null, p_payment_method: "cod",
    });
    expect(placed.error).toBeNull();
    const order = placed.data as { id: string; order_number: string };
    expect(order.order_number.startsWith(store.prefix)).toBe(true);
    const [row] = await sql<{ store_id: string; shipping_total: string }>("select store_id, shipping_total from public.orders where id = $1", [order.id]);
    expect(row.store_id).toBe(store.id);
    expect(Number(row.shipping_total)).toBe(9900);

    const own = await signedInAt(storeOwner, store.id);
    expect((await own.from("orders").select("id").eq("id", order.id)).data).toHaveLength(1);
    const homeAdmin = await makeUser("admin");
    expect((await homeAdmin.client.from("orders").select("id").eq("id", order.id)).data).toEqual([]);
    // Looking the order up through the home store finds nothing.
    expect((await storeClient(home, "service").rpc("order_detail", { p_order_id: order.id })).data).toBeNull();
  });

  it("shows customers their orders only in the store they ordered from", async () => {
    const customer = await makeUser();
    const a = await makeProduct();
    const sb = storeClient(home, "service");
    await sb.rpc("cart_set_item", { p_user_id: customer.id, p_token: null, p_variant_id: a.variantId, p_quantity: 1, p_mode: "add" });
    const placed = await sb.rpc("place_order", {
      p_user_id: customer.id, p_cart_token: null, p_idempotency_key: randomUUID(), p_email: customer.email, p_phone: "",
      p_shipping_address: uniqueAddress(), p_billing_address: null, p_rate_id: null, p_payment_method: "cod",
    });
    expect(placed.error).toBeNull();
    const id = (placed.data as { id: string }).id;
    expect((await (await signedInAt(customer, home)).from("orders").select("id").eq("id", id)).data).toHaveLength(1);
    expect((await (await signedInAt(customer, store.id)).from("orders").select("id").eq("id", id)).data).toEqual([]);
  });

  it("takes no orders while a store is suspended", async () => {
    const closed = await createStore("Closed Store");
    const b = await productIn(closed.id);
    const sb = storeClient(closed.id, "service");
    const token = guestToken();
    await sb.rpc("cart_set_item", { p_user_id: null, p_token: token, p_variant_id: b.variantId, p_quantity: 1, p_mode: "add" });
    expect((await platformAdmin.client.rpc("platform_update_store", { p_store_id: closed.id, p: { status: "suspended" } })).error).toBeNull();
    const placed = await sb.rpc("place_order", {
      p_user_id: null, p_cart_token: token, p_idempotency_key: randomUUID(), p_email: uniqueEmail(), p_phone: "",
      p_shipping_address: uniqueAddress(), p_billing_address: null, p_rate_id: null, p_payment_method: "cod",
    });
    expect(placed.error?.message).toBe("store_closed");
    expect((await storeClient(closed.id).rpc("resolve_store", { p_host: closed.host })).data).toMatchObject({ status: "suspended" });
  });
});

describe("store keys", () => {
  it("are never readable from the browser, even by the store's owner", async () => {
    await sql("insert into public.store_secrets (store_id, name, ciphertext, hint) values ($1, 'razorpay_key_secret', 'v1:x:y:z', 'abcd')", [store.id]);
    const own = await signedInAt(storeOwner, store.id);
    const read = await own.from("store_secrets").select("*");
    expect(read.data ?? []).toEqual([]);
    const write = await own.from("store_secrets").insert({ store_id: store.id, name: "razorpay_key_id", ciphertext: "x" });
    expect(write.error).not.toBeNull();
    const status = await own.rpc("store_secret_status");
    expect(status.data).toEqual([expect.objectContaining({ name: "razorpay_key_secret", hint: "abcd" })]);
    const homeAdmin = await signedInAt(await makeUser("admin"), store.id);
    expect((await homeAdmin.rpc("store_secret_status")).data).toEqual([]);
  });
});

describe("images", () => {
  it("can be uploaded only into the staff's own store folder", async () => {
    const file = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
    const homeAdmin = await makeUser("admin");
    const into = (client: TestUser["client"], folder: string) =>
      client.storage.from("catalog").upload(`${folder}/test/${randomUUID()}.png`, file, { contentType: "image/png" });
    expect((await into(homeAdmin.client, store.id)).error).not.toBeNull();
    expect((await into(homeAdmin.client, home)).error).toBeNull();
    expect((await into(storeOwner.client, store.id)).error).toBeNull();
    expect((await into(storeOwner.client, home)).error).not.toBeNull();
  });
});
