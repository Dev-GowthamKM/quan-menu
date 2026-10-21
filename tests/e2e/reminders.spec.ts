// Reminders in the browser, with the Resend mock receiving the emails: "notify me" for a
// sold-out size and the email when it's back; a bag left at checkout, its reminder, the
// link that restores it in another browser, and unsubscribing; the wishlist switch.
import { expect, test } from "@playwright/test";
import { CUSTOMER, OWNER } from "./support/env";
import { db, env, uniquePhone } from "./support/helpers";

const RESEND = "http://localhost:4013";
const run = Date.now().toString(36);

interface Mail { to: string[]; subject: string; html: string; headers: Record<string, string> }

async function mailTo(address: string): Promise<Mail[]> {
  return (await (await fetch(`${RESEND}/__test/emails?to=${encodeURIComponent(address)}`)).json()) as Mail[];
}

/** Runs the scheduled job (what Vercel Cron or pg_cron would do) and sends what it queued. */
async function runScheduledJob() {
  const res = await fetch(`${env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/cron/housekeeping`, { headers: { authorization: `Bearer ${env.CRON_SECRET}` } });
  expect(res.status).toBe(200);
}

const link = (html: string, path: string) => {
  const m = html.match(new RegExp(`href="(http[^"]*${path}[^"]*)"`));
  return m ? m[1].replace(/&amp;/g, "&") : null;
};

async function makeProduct() {
  const slug = `e2e-alerts-${run}`;
  const { data: product, error } = await db().from("products")
    .insert({ title: `Alert Tee ${run}`, slug, price: 149900, status: "active", published_at: new Date(Date.now() - 60_000).toISOString() })
    .select("id").single();
  if (error) throw new Error(error.message);
  await db().from("product_variants").insert([
    { product_id: product!.id, sku: `AL-${run}-S`.toUpperCase(), size: "S", color: "Black", stock_quantity: 0 },
    { product_id: product!.id, sku: `AL-${run}-M`.toUpperCase(), size: "M", color: "Black", stock_quantity: 5 },
  ]);
  return { id: product!.id, slug, title: `Alert Tee ${run}` };
}

test.describe.configure({ mode: "serial" });
let product: Awaited<ReturnType<typeof makeProduct>>;

test("a shopper asks to hear when a sold-out size is back, and gets one email when it is", async ({ page }) => {
  product = await makeProduct();
  const email = `alert-${run}@example.com`;
  await page.goto(`/products/${product.slug}`);
  await expect(page.getByRole("button", { name: "Size S (sold out)" })).toBeDisabled();
  await page.getByRole("button", { name: /Size sold out\? Get an email/ }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Notify me" }).click();
  await expect(page.getByText(`We'll email ${email} when Black, size S is back.`)).toBeVisible();

  await db().from("product_variants").update({ stock_quantity: 4 }).eq("sku", `AL-${run}-S`.toUpperCase());
  await runScheduledJob();
  const [mail] = await mailTo(email);
  expect(mail.subject).toBe(`${product.title} is back in stock`);
  expect(link(mail.html, `/products/${product.slug}`)).toContain("color=Black");
  expect(mail.headers["List-Unsubscribe"]).toBeUndefined();
});

test("a bag left at checkout gets one reminder that restores it anywhere, with a working unsubscribe", async ({ browser }) => {
  const admin = await browser.newContext({ storageState: OWNER.state });
  const settings = await admin.newPage();
  await settings.goto("/admin/settings?tab=emails");
  const reminders = settings.locator("form", { has: settings.getByRole("heading", { name: "Reminders" }) });
  await reminders.getByLabel("Remind shoppers about a bag left behind").check();
  await reminders.getByLabel("Send after (hours without changes)").fill("1");
  await reminders.getByRole("button", { name: "Save changes" }).click();
  await expect(settings.getByText("Settings saved.")).toBeVisible();

  // A guest reaches checkout and leaves.
  const email = `bag-${run}@example.com`;
  const shopper = await browser.newContext();
  const shop = await shopper.newPage();
  await shop.goto(`/products/${product.slug}`);
  await shop.getByRole("button", { name: "Size M", exact: true }).click();
  await shop.getByRole("button", { name: "Add to bag" }).click();
  await expect(shop.locator("dialog[open]")).toBeVisible();
  await shop.goto("/checkout");
  await expect(shop.getByText(/we.ll email you one reminder about your bag/)).toBeVisible();
  await shop.fill("#co-email", email);
  await shop.fill("#co-phone", uniquePhone());
  await shop.getByRole("button", { name: "Continue to address" }).click();
  await expect(shop.locator("#a-name")).toBeVisible();
  await expect.poll(async () => (await db().from("carts").select("id").eq("contact_email", email)).data?.length ?? 0).toBe(1);
  await shopper.close();

  // Three hours later (the bag is aged in the database), the scheduled job sends the reminder.
  await db().from("carts").update({ updated_at: new Date(Date.now() - 3 * 3600_000).toISOString() }).eq("contact_email", email);
  await runScheduledJob();
  await runScheduledJob();
  const mails = await mailTo(email);
  expect(mails.map((m) => m.subject)).toEqual(["You left something in your bag"]);
  const restore = link(mails[0].html, "/cart/restore");
  const unsubscribe = link(mails[0].html, "/unsubscribe");
  expect(restore && unsubscribe).toBeTruthy();
  expect(mails[0].headers["List-Unsubscribe"]).toMatch(/^<http.*\/api\/unsubscribe\?e=/);

  // The link restores the bag on another device.
  const phone = await browser.newContext();
  const elsewhere = await phone.newPage();
  await elsewhere.goto(restore!);
  await expect(elsewhere).toHaveURL(/\/cart\?restored=1/);
  await expect(elsewhere.getByText("We've put the items from your reminder email back in your bag.")).toBeVisible();
  await expect(elsewhere.getByRole("link", { name: product.title }).first()).toBeVisible();

  // Unsubscribing records the address; a forged link doesn't.
  await elsewhere.goto(unsubscribe!.replace(/s=[^&]+/, "s=forged"));
  await elsewhere.getByRole("button", { name: "Unsubscribe from reminders" }).click();
  await expect(elsewhere.getByText("This unsubscribe link isn't valid.")).toBeVisible();
  await elsewhere.goto(unsubscribe!);
  await elsewhere.getByRole("button", { name: "Unsubscribe from reminders" }).click();
  await expect(elsewhere.getByText("You're unsubscribed from reminders.")).toBeVisible();
  const { data: suppressed } = await db().from("email_suppressions").select("email").eq("email", email);
  expect(suppressed).toHaveLength(1);
  const oneClick = mails[0].headers["List-Unsubscribe"].slice(1, -1);
  expect((await fetch(oneClick, { method: "POST", body: "List-Unsubscribe=One-Click" })).status).toBe(200);
  await phone.close();

  // Leave the store as it was.
  await settings.reload();
  await reminders.getByLabel("Remind shoppers about a bag left behind").uncheck();
  await reminders.getByRole("button", { name: "Save changes" }).click();
  await expect(settings.getByText("Settings saved.")).toBeVisible();
  await admin.close();
});

test("customers switch wishlist price-drop emails on from their wishlist", async ({ browser }) => {
  await db().from("profiles").update({ price_alerts: false }).eq("email", CUSTOMER.email);
  const ctx = await browser.newContext({ storageState: CUSTOMER.state });
  const page = await ctx.newPage();
  await page.goto("/account/wishlist");
  const toggle = page.getByLabel(/Email me when something on my wishlist drops in price/);
  await toggle.check();
  await expect(page.getByText("We'll email you when something on your wishlist drops in price.")).toBeVisible();
  const { data } = await db().from("profiles").select("price_alerts").eq("email", CUSTOMER.email).single();
  expect(data?.price_alerts).toBe(true);
  await toggle.uncheck();
  await expect(page.getByText("Price-drop emails are off.")).toBeVisible();
  await ctx.close();
});
