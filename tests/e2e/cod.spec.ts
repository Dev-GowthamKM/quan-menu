// Cash-on-delivery safeguards in the browser: with confirmation switched on, a cash order
// waits for the customer to confirm it before it can be packed; staff can block cash on
// delivery for a customer, whose next checkout then only offers online payment.
import { expect, test, type Page } from "@playwright/test";
import { OWNER } from "./support/env";
import { checkout, db, uniquePhone } from "./support/helpers";

const run = Date.now().toString(36);

async function addInStockItem(page: Page) {
  const { data: variant } = await db()
    .from("product_variants")
    .select("color, size, products!inner(slug, status)")
    .eq("size", "M").eq("is_active", true).gte("stock_quantity", 3).eq("products.status", "active")
    .limit(1).single();
  const slug = (variant!.products as unknown as { slug: string }).slug;
  await page.goto(`/products/${slug}${variant!.color ? `?color=${encodeURIComponent(variant!.color)}` : ""}`);
  await page.getByRole("button", { name: "Size M", exact: true }).click();
  await page.getByRole("button", { name: "Add to bag" }).click();
  await expect(page.locator("dialog[open]")).toBeVisible();
}

test("cash orders wait for the customer's confirmation, and staff can block cash on delivery", async ({ browser }) => {
  const admin = await browser.newContext({ storageState: OWNER.state });
  const page = await admin.newPage();
  await page.goto("/admin/settings?tab=checkout");
  await page.getByLabel("Ask customers to confirm cash-on-delivery orders").check();
  await page.getByLabel("Cancel if not confirmed within (hours)").fill("12");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();

  // A guest pays cash on delivery and is asked to confirm.
  const shopper = await browser.newContext();
  const shop = await shopper.newPage();
  const email = `cod-${run}@example.com`;
  const phone = uniquePhone();
  await addInStockItem(shop);
  await checkout(shop, email, { cod: true, phone });
  await shop.waitForURL(/\/orders\/TA\d+\?key=.*placed=1/, { timeout: 60_000 });
  const orderNumber = new URL(shop.url()).pathname.split("/").pop()!;
  await expect(shop.getByText("Please confirm your order")).toBeVisible();
  const { data: mail } = await db().from("email_outbox").select("template").eq("to_email", email);
  expect((mail ?? []).map((m) => m.template)).toContain("order_confirmation");

  // Staff can't pack it yet.
  await page.goto(`/admin/orders/${orderNumber}`);
  await expect(page.getByText(/Waiting for the customer to confirm this cash-on-delivery order/)).toBeVisible();
  await page.getByRole("button", { name: "Mark packed" }).click();
  await expect(page.getByText(/hasn.t confirmed this cash-on-delivery order/).first()).toBeVisible();

  // The customer confirms; then it can be packed.
  await shop.getByRole("button", { name: "Confirm order" }).click();
  await expect(shop.getByText("You confirmed this cash-on-delivery order.")).toBeVisible();
  await expect(shop.getByText("Please confirm your order")).toBeHidden();
  await page.reload();
  await expect(page.getByText(/Waiting for the customer to confirm/)).toBeHidden();
  await page.getByRole("button", { name: "Mark packed" }).click();
  await expect(page.getByText("Order updated.")).toBeVisible();

  // Staff block cash on delivery for this customer: their next checkout offers online payment only.
  page.once("dialog", (d) => d.accept("Refused two parcels"));
  await page.getByRole("button", { name: "Block cash on delivery" }).click();
  await expect(page.getByText("Cash on delivery is blocked for this customer.")).toBeVisible();
  await addInStockItem(shop);
  await shop.goto("/checkout");
  await shop.fill("#co-email", email);
  await shop.fill("#co-phone", phone);
  await shop.getByRole("button", { name: "Continue to address" }).click();
  await shop.fill("#a-name", "Asha Rao");
  await shop.fill("#a-line1", "12, 4th Cross, Indiranagar");
  await shop.fill("#a-pin", "560038");
  await shop.fill("#a-city", "Bengaluru");
  await shop.selectOption("#a-state", "Karnataka");
  await shop.fill("#a-phone", phone);
  await shop.getByRole("button", { name: "Continue to delivery" }).click();
  await shop.getByRole("button", { name: "Continue to payment" }).click();
  await expect(shop.getByRole("radio", { name: /^Cash on delivery/ })).toBeDisabled();
  await expect(shop.getByText("Cash on delivery isn't available for this order. Please pay online.")).toBeVisible();

  // Leave the store as it was.
  await page.reload();
  await page.getByRole("button", { name: "Allow cash on delivery again" }).click();
  await expect(page.getByText("Cash on delivery is allowed again for this customer.")).toBeVisible();
  await page.goto("/admin/settings?tab=checkout");
  await page.getByLabel("Ask customers to confirm cash-on-delivery orders").uncheck();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  await admin.close();
  await shopper.close();
});
