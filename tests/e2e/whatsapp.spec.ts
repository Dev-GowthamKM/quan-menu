// WhatsApp order updates (the bundled Cloud API mock): an admin maps events to approved
// templates, a shopper opts in at checkout and gets the confirmation and shipping
// messages, and can turn them off from the order page.
import { expect, test } from "@playwright/test";
import { OWNER } from "./support/env";
import { checkout, db, stubRazorpay } from "./support/helpers";

const MOCK = "http://localhost:4012";
const run = Date.now().toString(36);

interface Sent { to: string; template: string; language: string; params: string[] }

async function sentFor(orderNumber: string): Promise<Sent[]> {
  const res = await fetch(`${MOCK}/__test/messages`);
  return ((await res.json()) as Sent[]).filter((m) => m.params.includes(orderNumber));
}

test("shoppers who opt in get order updates on WhatsApp and can turn them off", async ({ browser }) => {
  // The admin turns WhatsApp on with two approved templates.
  const admin = await browser.newContext({ storageState: OWNER.state });
  const page = await admin.newPage();
  await page.goto("/admin/settings?tab=whatsapp");
  await page.getByLabel("Send order updates on WhatsApp to customers who opt in").check();
  const rows = page.locator("li", { has: page.getByText("Template name") });
  await rows.filter({ hasText: "Order confirmed" }).getByLabel("Template name").fill("order_confirmed");
  await rows.filter({ hasText: "Shipped" }).getByLabel("Template name").fill("order_shipped_v2");
  await rows.filter({ hasText: "Delivered" }).getByLabel("Template name").fill("order_delivered");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("WhatsApp settings saved.")).toBeVisible();
  await page.getByLabel("Mobile number").fill("+91 98450 12345");
  await page.getByRole("button", { name: "Send WhatsApp test" }).click();
  await expect(page.getByText(/Test message sent/)).toBeVisible();

  // A guest opts in at checkout and pays.
  const { data: variant } = await db()
    .from("product_variants")
    .select("color, products!inner(slug, status)")
    .eq("size", "M").eq("is_active", true).gte("stock_quantity", 3).eq("products.status", "active")
    .limit(1).single();
  const shopper = await browser.newContext();
  await stubRazorpay(shopper, "captured");
  const shop = await shopper.newPage();
  const slug = (variant!.products as unknown as { slug: string }).slug;
  await shop.goto(`/products/${slug}${variant!.color ? `?color=${encodeURIComponent(variant!.color)}` : ""}`);
  await shop.getByRole("button", { name: "Size M", exact: true }).click();
  await shop.getByRole("button", { name: "Add to bag" }).click();
  await expect(shop.locator("dialog[open]")).toBeVisible();
  await checkout(shop, `wa-${run}@example.com`, { whatsapp: true });
  await shop.waitForURL(/\/orders\/TA\d+\?key=.*placed=1/, { timeout: 60_000 });
  const orderNumber = new URL(shop.url()).pathname.split("/").pop()!;
  await expect.poll(async () => (await sentFor(orderNumber)).map((m) => m.template), { timeout: 15_000 }).toEqual(["order_confirmed"]);
  const [confirmation] = await sentFor(orderNumber);
  expect(confirmation.to).toBe("919876543210");
  expect(confirmation.params[0]).toBe("Asha");
  expect(confirmation.params[3]).toMatch(new RegExp(`/orders/${orderNumber}\\?key=`));

  // Shipping sends the tracking update.
  await page.goto(`/admin/orders/${orderNumber}`);
  await expect(page.getByText("WhatsApp updates on")).toBeVisible();
  await page.getByRole("button", { name: "Mark shipped…" }).click();
  await page.getByLabel("Tracking number").fill(`WA${run}`);
  await page.getByRole("button", { name: "Save shipment" }).click();
  await expect(page.getByRole("button", { name: "Mark delivered" })).toBeVisible();
  await expect.poll(async () => (await sentFor(orderNumber)).map((m) => m.template), { timeout: 15_000 }).toEqual(["order_confirmed", "order_shipped_v2"]);
  expect((await sentFor(orderNumber))[1].params).toContain(`WA${run}`);

  // The shopper turns WhatsApp off; the next update isn't sent there.
  await shop.reload();
  await shop.getByRole("button", { name: "Turn off" }).click();
  await expect(shop.getByText("WhatsApp updates are off for this order.")).toBeVisible();
  await page.getByRole("button", { name: "Mark delivered" }).click();
  await expect(page.getByText("Marked as delivered.")).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await sentFor(orderNumber)).toHaveLength(2);

  // Leave the store as it was.
  await page.goto("/admin/settings?tab=whatsapp");
  await page.getByLabel("Send order updates on WhatsApp to customers who opt in").uncheck();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("WhatsApp settings saved.")).toBeVisible();
  await admin.close();
  await shopper.close();
});
