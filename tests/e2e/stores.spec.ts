// Multi-store: the platform's administrator creates a second shop from the admin, which
// opens at its own web address with its own look, catalog, orders, staff view, Razorpay
// account and webhook; it can be suspended and opened again.
import { createHmac, randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { OWNER } from "./support/env";
import { addToBag, checkout, db, env, stubRazorpay } from "./support/helpers";

test.describe.configure({ mode: "serial" });

const run = randomUUID().slice(0, 6);
const NAME = `Kesar Studio ${run}`;
const PREFIX = `K${Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("")}`;
const HOST = `kesar-${run}.localhost:3000`;
const ORIGIN = `http://${HOST}`;
// The mock Razorpay's second account (tests/e2e/support/mock-razorpay.mjs).
const KEYS = { id: "rzp_test_secondstore1", secret: "secondstoresecret0123456789", webhook: `whsec_kesar_${run}` };

const state: { storeId?: string; slug?: string; codOrder?: string } = {};

const owner = (browser: Browser) => browser.newContext({ storageState: OWNER.state });

/** Switches the owner's admin panel to a store with the store picker. */
async function useStore(page: Page, name: string) {
  await page.goto("/admin");
  await page.getByLabel("Store").selectOption({ label: name });
  await expect(page.getByLabel("Store")).toHaveValue(/.+/);
  await page.waitForURL("**/admin");
  await expect(page.getByLabel("Store").locator("option:checked")).toHaveText(name);
}

test("the platform's administrator creates a store, which opens at its own address with its own look", async ({ browser }) => {
  const admin = await owner(browser);
  const page = await admin.newPage();
  await page.goto("/admin/stores");
  await page.getByRole("link", { name: "New store" }).click();
  await page.getByLabel("Store name").fill(NAME);
  await page.getByLabel("Order numbers start with").fill(PREFIX);
  await page.getByLabel("Address customers will visit").fill(HOST);
  await page.getByRole("radio", { name: "Heritage" }).click();
  await expect(page.getByRole("radio", { name: "Heritage" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Create store" }).click();
  await expect(page.getByText(`${NAME} is ready. Next:`)).toBeVisible();
  state.storeId = page.url().match(/stores\/([0-9a-f-]{36})/)![1];
  await admin.close();

  const { data: settings } = await db().from("store_settings").select("store_name, brand_color, design").eq("store_id", state.storeId).single();
  expect(settings).toMatchObject({ store_name: NAME, design: "heritage" });
  // One of Heritage's palettes.
  expect(["#7b1e24", "#0e5560", "#9c3510", "#4a2c1d", "#1f2b6e"]).toContain(settings!.brand_color);

  // With nothing on sale yet, its home page says it's opening soon.
  const early = await browser.newContext();
  const soon = await early.newPage();
  await soon.goto(`${ORIGIN}/`);
  await expect(soon.getByText("Opening soon")).toBeVisible();
  await expect(soon.getByRole("heading", { level: 1 })).toHaveText(NAME);
  await early.close();

  // A product in the new store (the catalog editor itself is covered by the acceptance tests).
  state.slug = `kesar-kurta-${run}`;
  const { data: product, error } = await db()
    .from("products")
    .insert({ store_id: state.storeId, title: `Kesar Linen Kurta ${run}`, slug: state.slug, price: 189900, status: "active" })
    .select("id")
    .single();
  expect(error).toBeNull();
  await db().from("product_variants").insert({ product_id: product!.id, sku: `KS-${run}-M`.toUpperCase(), size: "M", color: "Saffron", stock_quantity: 5 });

  const guest = await browser.newContext();
  const shop = await guest.newPage();
  await shop.goto(`${ORIGIN}/`);
  await expect(shop).toHaveTitle(new RegExp(NAME));
  const brand = await shop.locator("#main").evaluate((el) => getComputedStyle(el).getPropertyValue("--color-brand").trim());
  expect(brand).toBe(settings!.brand_color);
  await expect(shop.locator("[data-design]")).toHaveAttribute("data-design", "heritage");
  await shop.goto(`${ORIGIN}/shop`);
  await expect(shop.getByRole("link", { name: new RegExp(`Kesar Linen Kurta ${run}`) }).first()).toBeVisible();
  // The main store's products aren't part of this store.
  const { data: taana } = await db().from("products").select("slug").eq("store_id", (await db().rpc("home_store_id")).data).eq("status", "active").limit(1).single();
  const missing = await shop.goto(`${ORIGIN}/products/${taana!.slug}`);
  expect(missing?.status()).toBe(404);
  // And this store's product isn't in the main store.
  expect((await shop.goto(`/products/${state.slug}`))?.status()).toBe(404);
  await guest.close();
});

test("a shopper orders from the new store; only that store's admin shows the order", async ({ browser }) => {
  const guest = await browser.newContext();
  const shop = await guest.newPage();
  await addToBag(shop, state.slug!, "M", 1, ORIGIN);
  await checkout(shop, `kesar-${run}@example.com`, { cod: true, origin: ORIGIN });
  await shop.waitForURL(new RegExp(`/orders/${PREFIX}\\d+\\?key=.*placed=1`), { timeout: 60_000 });
  expect(new URL(shop.url()).host).toBe(HOST);
  await expect(shop.getByText(/your order is confirmed/i)).toBeVisible();
  state.codOrder = new URL(shop.url()).pathname.split("/").pop()!;
  await guest.close();

  const { data: order } = await db().from("orders").select("store_id, shipping_total").eq("order_number", state.codOrder).single();
  expect(order).toEqual({ store_id: state.storeId, shipping_total: 9900 });

  const admin = await owner(browser);
  const page = await admin.newPage();
  await useStore(page, "Taana");
  await page.goto(`/admin/orders?q=${state.codOrder}`);
  await expect(page.getByRole("link", { name: state.codOrder })).toHaveCount(0);
  await useStore(page, NAME);
  await page.goto(`/admin/orders?q=${state.codOrder}`);
  await expect(page.getByRole("link", { name: state.codOrder })).toBeVisible();
  await admin.close();
});

test("the store takes online payments into its own Razorpay account, with its own webhook", async ({ browser, request }) => {
  const admin = await owner(browser);
  const page = await admin.newPage();
  await useStore(page, NAME);
  await page.goto("/admin/settings?tab=payments");
  await page.getByLabel("Key id").fill(KEYS.id);
  await page.getByLabel("Key secret").fill(KEYS.secret);
  await page.getByLabel("Webhook secret").fill(KEYS.webhook);
  await page.getByRole("button", { name: "Save keys" }).click();
  await expect(page.getByText("Razorpay keys saved.").first()).toBeVisible();
  await expect(page.getByText("••••ore1")).toBeVisible();
  await expect(page.getByLabel("Webhook URL")).toHaveValue(new RegExp(`/api/webhooks/razorpay\\?store=${state.storeId}$`));
  await admin.close();
  // Only the encrypted values are stored.
  const { data: saved } = await db().from("store_secrets").select("name, ciphertext").eq("store_id", state.storeId);
  expect(saved).toHaveLength(3);
  for (const s of saved!) expect(s.ciphertext).not.toContain(KEYS.secret);

  const guest = await browser.newContext();
  await stubRazorpay(guest, "captured");
  const shop = await guest.newPage();
  await addToBag(shop, state.slug!, "M", 1, ORIGIN);
  await checkout(shop, `kesar-pay-${run}@example.com`, { origin: ORIGIN });
  await shop.waitForURL(new RegExp(`/orders/${PREFIX}\\d+\\?key=.*placed=1`), { timeout: 60_000 });
  await expect(shop.getByText(/your order is confirmed/i)).toBeVisible();
  const number = new URL(shop.url()).pathname.split("/").pop()!;
  await guest.close();

  const mock = await (await fetch("http://127.0.0.1:4010/__test/state")).json();
  const rzpOrder = mock.orders.find((o: { receipt: string }) => o.receipt === number);
  expect(rzpOrder.account).toBe(KEYS.id);
  const { data: order } = await db().from("orders").select("status, payment_status").eq("order_number", number).single();
  expect(order).toEqual({ status: "confirmed", payment_status: "paid" });

  // Webhooks for this store must be signed with its own secret.
  const raw = JSON.stringify({ event: "test.ping", payload: {} });
  const signed = (secret: string) => ({
    "content-type": "application/json",
    "x-razorpay-signature": createHmac("sha256", secret).update(raw).digest("hex"),
    "x-razorpay-event-id": `evt_${randomUUID()}`,
  });
  const ownHook = await request.post(`/api/webhooks/razorpay?store=${state.storeId}`, { data: raw, headers: signed(KEYS.webhook) });
  expect(ownHook.status()).toBe(200);
  const otherSecret = await request.post(`/api/webhooks/razorpay?store=${state.storeId}`, { data: raw, headers: signed(env.RAZORPAY_WEBHOOK_SECRET) });
  expect(otherSecret.status()).toBe(400);
  const homeHook = await request.post("/api/webhooks/razorpay", { data: raw, headers: signed(env.RAZORPAY_WEBHOOK_SECRET) });
  expect(homeHook.status()).toBe(200);
});

test("a store can start with the sample catalog, ready to shop", async ({ browser }) => {
  const name = `Sample Studio ${run}`;
  const host = `sample-${run}.localhost:3000`;
  const admin = await owner(browser);
  const page = await admin.newPage();
  await page.goto("/admin/stores/new");
  await page.getByLabel("Store name").fill(name);
  await page.getByLabel("Order numbers start with").fill(`S${PREFIX.slice(1)}`);
  await page.getByLabel("Address customers will visit").fill(host);
  await page.getByLabel("Start with the sample catalog").check();
  await page.getByRole("button", { name: "Create store" }).click();
  await expect(page.getByText(/Added \d+ sample products/).first()).toBeVisible();
  await expect(page.getByText(`${name} is ready. Next:`)).toBeVisible();
  const storeId = page.url().match(/stores\/([0-9a-f-]{36})/)![1];
  await admin.close();

  const { count } = await db().from("products").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("is_sample", true);
  expect(count).toBeGreaterThan(40);
  const guest = await browser.newContext();
  const shop = await guest.newPage();
  await shop.goto(`http://${host}/`);
  await expect(shop.getByRole("heading", { name: "The quiet season" })).toBeVisible();
  await expect(shop.getByText("Opening soon")).toHaveCount(0);
  const product = await shop.goto(`http://${host}/products/bias-cut-satin-slip-dress`);
  expect(product?.status()).toBe(200);
  await expect(shop.getByRole("heading", { level: 1 })).toContainText(/Slip Dress/i);
  await guest.close();
});

test("the setup page lists what's left, and the dashboard points to it", async ({ browser }) => {
  const admin = await owner(browser);
  const page = await admin.newPage();
  await useStore(page, "Taana");
  await expect(page.getByRole("link", { name: "See what's left" })).toBeVisible();
  await page.getByRole("link", { name: "See what's left" }).click();
  await page.waitForURL("**/admin/setup");
  await expect(page.getByRole("heading", { name: "Setup" })).toBeVisible();
  await expect(page.getByText("The database has every update this version of the app needs.")).toBeVisible();
  for (const item of ["Contact details", "Shipping, returns, privacy and terms", "Sample data removed", "Online payments", "Order emails"]) {
    await expect(page.getByText(item, { exact: true })).toBeVisible();
  }
  // Up to date, so the update download says there's nothing to run.
  const sql = await page.request.get("/admin/setup/update-sql");
  expect(sql.status()).toBe(200);
  expect(await sql.text()).toContain("up to date");
  await admin.close();
});

test("a suspended store shows a closed page until it's opened again", async ({ browser }) => {
  const admin = await owner(browser);
  const page = await admin.newPage();
  await page.goto(`/admin/stores/${state.storeId}`);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Suspend store" }).click();
  await expect(page.getByText(/The store is suspended/).first()).toBeVisible();

  const guest = await browser.newContext();
  const shop = await guest.newPage();
  // The storefront notices within about half a minute (the address lookup is cached briefly).
  await expect(async () => {
    await shop.goto(`${ORIGIN}/`);
    await expect(shop.getByRole("heading", { name: "Closed for now" })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 60_000, intervals: [2000] });
  // The main store stays open.
  await shop.goto("/");
  await expect(shop.getByRole("heading", { name: "Closed for now" })).toHaveCount(0);

  await page.getByRole("button", { name: "Open the store again" }).click();
  await expect(page.getByText("The store is open again.").first()).toBeVisible();
  await expect(async () => {
    await shop.goto(`${ORIGIN}/`);
    await expect(shop).toHaveTitle(new RegExp(NAME), { timeout: 1000 });
  }).toPass({ timeout: 60_000, intervals: [2000] });
  await guest.close();
  await admin.close();
});
