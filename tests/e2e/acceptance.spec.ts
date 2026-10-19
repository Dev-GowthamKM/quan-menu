// Acceptance tests 1–7 from the project brief, run in order against one fresh product:
// publish → buy → edit price → failed/duplicate/expired payments → fulfil → security →
// persistence. Uses the local Supabase and the Razorpay mock (see playwright.config.ts).
import { expect, test, type Browser, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { COUPON, CUSTOMER, OWNER } from "./support/env";
import { addToBag, checkout, db, env, pngBuffer, signedWebhook, stubRazorpay } from "./support/helpers";

test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36).toUpperCase();
const title = `E2E Linen Overshirt ${run}`;
const state: { productId?: string; slug?: string; copySlug?: string; orderNumber?: string; orderUrl?: string; paymentId?: string } = {};

async function ownerContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ storageState: OWNER.state });
}

async function variant(sku: string) {
  const { data } = await db().from("product_variants").select("id, stock_quantity, reserved_quantity").eq("sku", sku).single();
  return data!;
}

test("1. An admin publishes a product with images and variants, and customers see it", async ({ browser }) => {
  const admin = await ownerContext(browser);
  const page = await admin.newPage();
  await page.goto("/admin/products/new");
  await page.getByRole("textbox", { name: "Title", exact: true }).fill(title);
  await page.getByRole("textbox", { name: /^Description/ }).fill("Relaxed overshirt in washed linen.\n\nMade for end-to-end tests.");
  await page.getByRole("textbox", { name: /^Price \(₹\)/ }).first().fill("1999");
  for (const size of ["S", "M", "L"]) {
    await page.locator("#opt-sizes").fill(size);
    await page.locator("#opt-sizes").press("Enter");
  }
  await page.locator("#opt-colors").fill("Black");
  await page.locator("#opt-colors").press("Enter");
  await page.getByLabel("SKU prefix").fill(`E2E-${run}`);
  await page.getByRole("button", { name: "Regenerate new SKUs" }).click();
  await page.getByLabel("Stock for all").fill("10");
  await page.getByRole("button", { name: "Apply" }).first().click();
  await page.locator('input[type="file"]').first().setInputFiles({ name: "overshirt-front.png", mimeType: "image/png", buffer: pngBuffer() });
  await expect(page.getByText("Main image")).toBeVisible();
  await page.getByLabel("Alt text for image 1").fill("Black linen overshirt, front");
  await page.getByLabel("Status").selectOption("active");
  await page.getByRole("button", { name: "Save product" }).click();
  await page.waitForURL(/\/admin\/products\/[0-9a-f-]{36}$/);
  state.productId = page.url().split("/").pop()!;

  const { data: product } = await db().from("products").select("slug, status, available_stock, price").eq("id", state.productId).single();
  expect(product).toMatchObject({ status: "active", available_stock: 30, price: 199900 });
  state.slug = product!.slug;
  const { data: images } = await db().from("product_images").select("storage_path, alt").eq("product_id", state.productId);
  expect(images).toHaveLength(1);
  expect(images![0].storage_path).toMatch(/^products\/\d{4}\/\d{2}\/overshirt-front-[0-9a-f]{8}\.(webp|png)$/);

  // A draft copy stays hidden from customers.
  await page.getByRole("button", { name: "Duplicate" }).click();
  await page.waitForURL((u) => !u.pathname.endsWith(state.productId!));
  const { data: copy } = await db().from("products").select("slug, status").eq("id", page.url().split("/").pop()!).single();
  expect(copy!.status).toBe("draft");
  state.copySlug = copy!.slug;
  await admin.close();

  const visitor = await browser.newContext();
  const store = await visitor.newPage();
  await store.goto(`/products/${state.slug}`);
  await expect(store.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(store.getByText("₹1,999").first()).toBeVisible();
  for (const size of ["S", "M", "L"]) await expect(store.getByRole("button", { name: `Size ${size}`, exact: true })).toBeVisible();
  await store.goto(`/shop?q=${encodeURIComponent(title)}`);
  await expect(store.getByRole("link", { name: new RegExp(title) }).first()).toBeVisible();
  const draft = await store.goto(`/products/${state.copySlug}`);
  expect(draft?.status()).toBe(404);
  await visitor.close();
});

test("3. A customer applies a code and pays; the order is confirmed and stock is taken", async ({ browser }) => {
  const ctx = await browser.newContext();
  await stubRazorpay(ctx, "captured");
  const page = await ctx.newPage();
  await addToBag(page, state.slug!, "M", 3);
  await checkout(page, `buyer-${run.toLowerCase()}@example.com`, { coupon: COUPON });
  await page.waitForURL(/\/orders\/TA\d+\?key=.*placed=1/, { timeout: 60_000 });
  await expect(page.getByText(/your order is confirmed/i)).toBeVisible();
  state.orderUrl = page.url().replace(/&placed=1$/, "");
  state.orderNumber = new URL(page.url()).pathname.split("/").pop()!;
  await ctx.close();

  const { data: order } = await db().from("orders").select("id, status, payment_status, subtotal, discount_total, shipping_total, grand_total, coupon_code").eq("order_number", state.orderNumber).single();
  expect(order).toMatchObject({ status: "confirmed", payment_status: "paid", coupon_code: COUPON, subtotal: 599700, discount_total: 59970 });
  expect(order!.grand_total).toBe(order!.subtotal - order!.discount_total + order!.shipping_total);
  const { data: payments } = await db().from("payments").select("provider_payment_id, status, amount").eq("order_id", order!.id).eq("status", "captured");
  expect(payments).toHaveLength(1);
  expect(payments![0].amount).toBe(order!.grand_total);
  state.paymentId = payments![0].provider_payment_id!;
  expect(await variant(`E2E-${run}-BLA-M`)).toMatchObject({ stock_quantity: 7, reserved_quantity: 0 });

  const admin = await ownerContext(browser);
  const p = await admin.newPage();
  await p.goto(`/admin/orders?q=${state.orderNumber}`);
  await expect(p.getByRole("link", { name: state.orderNumber })).toBeVisible();
  await admin.close();
});

test("2. Editing a product changes the store, while past orders keep the price paid", async ({ browser }) => {
  const admin = await ownerContext(browser);
  const page = await admin.newPage();
  await page.goto(`/admin/products/${state.productId}`);
  await page.getByRole("textbox", { name: /^Price \(₹\)/ }).first().fill("2499");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("All changes saved")).toBeVisible();
  await page.goto(`/admin/orders/${state.orderNumber}`);
  await expect(page.getByText("₹1,999 × 3")).toBeVisible();
  await admin.close();

  const { data: items } = await db().from("order_items").select("unit_price, quantity, product_title").eq("sku", `E2E-${run}-BLA-M`);
  expect(items).toEqual([{ unit_price: 199900, quantity: 3, product_title: title }]);

  const visitor = await browser.newContext();
  const store = await visitor.newPage();
  await store.goto(`/products/${state.slug}`);
  await expect(store.getByText("₹2,499").first()).toBeVisible();
  await visitor.close();
});

test("4. Failed payments hold stock until they expire; duplicate and forged webhooks change nothing", async ({ browser, request }) => {
  const ctx = await browser.newContext();
  await stubRazorpay(ctx, "failed");
  const page = await ctx.newPage();
  await addToBag(page, state.slug!, "S");
  const email = `declined-${run.toLowerCase()}@example.com`;
  await checkout(page, email);
  await expect(page.getByText(/Payment failed/)).toBeVisible();
  await ctx.close();

  const { data: failed } = await db().from("orders").select("id, status, payment_status").eq("email", email).single();
  expect(failed!.status).toBe("pending_payment");
  expect(await variant(`E2E-${run}-BLA-S`)).toMatchObject({ stock_quantity: 10, reserved_quantity: 1 });

  // The hold runs out: the scheduled job releases the stock and closes the order.
  await db().from("orders").update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", failed!.id);
  const cron = await request.get("/api/cron/housekeeping", { headers: { authorization: `Bearer ${env.CRON_SECRET}` } });
  expect(cron.ok()).toBeTruthy();
  const { data: expired } = await db().from("orders").select("status").eq("id", failed!.id).single();
  expect(expired!.status).toBe("cancelled");
  expect(await variant(`E2E-${run}-BLA-S`)).toMatchObject({ stock_quantity: 10, reserved_quantity: 0 });

  // The same signed webhook twice: processed once, then recognised as a duplicate.
  const body = { event: "payment.captured", payload: { payment: { entity: { id: state.paymentId, order_id: null } } } };
  const hook = signedWebhook(body);
  const first = await request.post("/api/webhooks/razorpay", { data: hook.raw, headers: hook.headers });
  expect(first.status()).toBe(200);
  const second = await request.post("/api/webhooks/razorpay", { data: hook.raw, headers: hook.headers });
  expect(await second.json()).toMatchObject({ duplicate: true });
  const forged = await request.post("/api/webhooks/razorpay", { data: hook.raw, headers: { ...hook.headers, "x-razorpay-signature": "0".repeat(64), "x-razorpay-event-id": "evt_forged" } });
  expect(forged.status()).toBe(400);

  const { data: order } = await db().from("orders").select("id, payment_status").eq("order_number", state.orderNumber).single();
  expect(order!.payment_status).toBe("paid");
  const { count } = await db().from("payments").select("id", { count: "exact", head: true }).eq("order_id", order!.id).eq("status", "captured");
  expect(count).toBe(1);
  expect(await variant(`E2E-${run}-BLA-M`)).toMatchObject({ stock_quantity: 7 });
});

test("5. Fulfilment updates made by staff are visible to the customer", async ({ browser }) => {
  const admin = await ownerContext(browser);
  const page = await admin.newPage();
  await page.goto(`/admin/orders/${state.orderNumber}`);
  await page.getByRole("button", { name: "Start preparing" }).click();
  await expect(page.getByRole("button", { name: "Mark packed" })).toBeVisible();
  await page.getByRole("button", { name: "Mark shipped…" }).click();
  await page.getByLabel(/^Courier/).selectOption("Delhivery");
  await page.getByLabel("Tracking number").fill(`E2E${run}`);
  await page.getByRole("button", { name: "Save shipment" }).click();
  await expect(page.getByRole("button", { name: "Mark delivered" })).toBeVisible();
  await admin.close();

  const guest = await browser.newContext();
  const order = await guest.newPage();
  await order.goto(state.orderUrl!);
  await expect(order.getByText(`E2E${run}`).first()).toBeVisible();
  await expect(order.getByText(/Shipped/).first()).toBeVisible();
  await guest.close();

  const { data: emails } = await db().from("email_outbox").select("template").eq("to_email", `buyer-${run.toLowerCase()}@example.com`);
  expect((emails ?? []).map((e) => e.template)).toEqual(expect.arrayContaining(["order_confirmation", "order_shipped"]));
});

test("6. Customers can't reach the admin, raise their role, or read private data", async ({ browser, request }) => {
  const ctx = await browser.newContext({ storageState: CUSTOMER.state });
  const page = await ctx.newPage();
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByText(/doesn.t have staff access/)).toBeVisible();
  const exportRes = await page.request.get("/admin/orders/export", { maxRedirects: 0 });
  expect([302, 303, 307, 403]).toContain(exportRes.status());
  // Someone else's order needs its private link.
  const other = await page.goto(`/orders/${state.orderNumber}`);
  expect(other?.status()).toBe(404);
  await ctx.close();

  // Straight to the database API with the customer's own session.
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: session } = await sb.auth.signInWithPassword({ email: CUSTOMER.email, password: CUSTOMER.password });
  const me = session.user!.id;
  expect((await sb.from("user_roles").insert({ user_id: me, role: "owner" })).error).not.toBeNull();
  expect((await sb.rpc("grant_role", { p_email: CUSTOMER.email, p_role: "owner" })).error).not.toBeNull();
  expect((await sb.rpc("admin_save_product", { p: { title: "Hack", price: 1, status: "active", variants: [{ sku: "HACK-1", stock_quantity: 1 }] } })).error).not.toBeNull();
  expect((await sb.from("products").update({ price: 100 }).eq("id", state.productId!).select()).data ?? []).toHaveLength(0);
  expect((await sb.from("product_variants").update({ stock_quantity: 999 }).eq("sku", `E2E-${run}-BLA-L`).select()).data ?? []).toHaveLength(0);
  expect((await sb.from("products").select("id").eq("slug", state.copySlug!)).data).toEqual([]);
  expect((await sb.from("payments").select("id")).data).toEqual([]);
  expect((await sb.from("orders").select("id").eq("order_number", state.orderNumber!)).data).toEqual([]);
  expect((await sb.storage.from("catalog").upload(`products/hack-${run}.png`, pngBuffer(), { contentType: "image/png" })).error).not.toBeNull();
  const { data: role } = await sb.rpc("my_role");
  expect(role).toBeNull();
  expect(await variant(`E2E-${run}-BLA-L`)).toMatchObject({ stock_quantity: 10 });

  // Scheduled jobs need the server's secret.
  expect((await request.get("/api/cron/housekeeping")).status()).toBe(401);
});

test("7. Everything is stored on the server: carts, products and orders survive a fresh browser", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await addToBag(page, state.slug!, "L");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto("/cart");
  await expect(page.getByText(title).first()).toBeVisible();
  await ctx.close();

  // A brand-new admin session (nothing cached in the browser) sees the same data.
  const admin = await ownerContext(browser);
  const p = await admin.newPage();
  await p.goto(`/admin/products?q=${encodeURIComponent(title)}`);
  await expect(p.getByRole("link", { name: title, exact: true })).toBeVisible();
  await expect(p.getByText("₹2,499").first()).toBeVisible();
  await p.goto(`/admin/orders/${state.orderNumber}`);
  await expect(p.getByText(`E2E${run}`).first()).toBeVisible();
  await admin.close();
});
